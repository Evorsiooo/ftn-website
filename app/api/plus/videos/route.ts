import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { videos, videoViews, siteSettings } from "@/db/schema";
import { desc, eq, gte, sql } from "drizzle-orm";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { syncAllConfiguredChannels, verifyActiveLives, isChannelMatching } from "@/lib/youtube";

export const runtime = "edge";

const CACHE_TTL_SECONDS = 30;

// Runs work after the response is sent so slow upstream calls (YouTube) never block page loads.
function runInBackground(task: Promise<unknown>) {
  const safe = task.catch((err) => console.warn("Background task error:", err));
  try {
    getRequestContext().ctx.waitUntil(safe);
  } catch {
    // No request context (local dev): the promise still runs, just unawaited.
  }
}

export async function GET(request: NextRequest) {
  // Cloudflare does not edge-cache dynamic function responses from Cache-Control alone,
  // so serve repeat hits from the Cache API. `?fresh=1` (admin screens) bypasses it.
  const bypassCache = new URL(request.url).searchParams.has("fresh");
  const edgeCache = typeof caches !== "undefined" ? (caches as any).default as Cache | undefined : undefined;
  const cacheKey = new Request(new URL(request.url).origin + "/api/plus/videos");
  if (edgeCache && !bypassCache) {
    try {
      const hit = await edgeCache.match(cacheKey);
      if (hit) return hit;
    } catch {}
  }

  const response = await buildResponse();
  if (edgeCache && response.ok && response.headers.get("Cache-Control")?.includes("s-maxage")) {
    runInBackground(edgeCache.put(cacheKey, response.clone()));
  }
  return response;
}

async function buildResponse(): Promise<Response> {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({
        videos: [],
        featuredVideo: null,
        trendingVideos: [],
        customSwimlanes: [],
        ftnPlusAccess: "public",
        allowSignIn: true,
      });
    }

    const db = getDb(d1);

    // 1. Fetch site settings for swimlane configs, access gate, and channels
    let ftnPlusAccess = "public";
    let allowSignIn = true;
    let configuredSwimlanes: any[] = [];
    let configuredChannels: string[] = [];
    let hiddenVideoIds: string[] = [];
    let hiddenFeaturedChannels: string[] = [];
    let hiddenTrendingChannels: string[] = [];

    try {
      const settingsRows = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, "main_config"))
        .limit(1);

      if (settingsRows.length > 0) {
        try {
          const config = JSON.parse(settingsRows[0].valueJson);
          if (config.ftnPlusAccess) ftnPlusAccess = config.ftnPlusAccess;
          if (typeof config.allowSignIn === "boolean") allowSignIn = config.allowSignIn;
          if (Array.isArray(config.customSwimlanes)) configuredSwimlanes = config.customSwimlanes;
          if (Array.isArray(config.hiddenVideoIds)) hiddenVideoIds = config.hiddenVideoIds;
          if (Array.isArray(config.hiddenFeaturedChannels)) {
            hiddenFeaturedChannels = config.hiddenFeaturedChannels
              .filter((c: any) => typeof c === "string" && c.trim())
              .map((c: string) => c.trim());
          }
          if (Array.isArray(config.hiddenTrendingChannels)) {
            hiddenTrendingChannels = config.hiddenTrendingChannels
              .filter((c: any) => typeof c === "string" && c.trim())
              .map((c: string) => c.trim());
          }
          if (Array.isArray(config.youtubeChannels)) {
            configuredChannels = config.youtubeChannels
              .filter((c: any) => typeof c === "string" && c.trim())
              .map((c: string) => c.trim());
          }
        } catch {}
      }
    } catch (cfgErr) {
      console.warn("Failed to query main_config:", cfgErr);
    }

    // 2. Automated sync: runs after the response so YouTube latency never blocks the library.
    // New videos appear on the next cache refresh.
    runInBackground(
      syncAllConfiguredChannels(db, {
        cooldownMs: 60 * 1000,
        channelIds: configuredChannels.length > 0 ? configuredChannels : undefined,
      })
    );

    // 3. Fetch all ingested videos
    let rawVideos: any[] = [];
    try {
      rawVideos = await db
        .select()
        .from(videos)
        .orderBy(desc(videos.publishedAt));
    } catch (vidErr) {
      console.error("Failed to query videos table:", vidErr);
    }

    // 4. Live status verification against the YouTube API, also after the response.
    const activeLivesInDb = rawVideos.filter((v) => v.isLive === true);
    if (activeLivesInDb.length > 0 && process.env.YOUTUBE_API_KEY) {
      runInBackground(verifyActiveLives(db, activeLivesInDb.map((v) => ({ ...v }))));
    }

    // Deduplicate all videos by youtubeId, filter hidden videos, and enforce strictly parsed Date timestamp sorting
    const uniqueVideos: any[] = [];
    const seenYoutubeIds = new Set<string>();
    const hiddenSet = new Set<string>(hiddenVideoIds);

    for (const v of rawVideos) {
      const ytid = v.youtubeId || v.id;
      if (ytid && !seenYoutubeIds.has(ytid) && !hiddenSet.has(ytid) && !hiddenSet.has(v.id)) {
        seenYoutubeIds.add(ytid);
        uniqueVideos.push(v);
      }
    }

    let allVideos = uniqueVideos.sort((a, b) => {
      const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return timeB - timeA;
    });

    // 5. Past 7-day view counts, aggregated in SQL instead of scanning the whole table.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const viewCountMap: Record<string, number> = {};
    try {
      const counts = await db
        .select({ videoId: videoViews.videoId, n: sql<number>`count(*)` })
        .from(videoViews)
        .where(gte(videoViews.viewedAt, sevenDaysAgo))
        .groupBy(videoViews.videoId);
      for (const c of counts) viewCountMap[c.videoId] = Number(c.n);
    } catch (viewsErr) {
      console.warn("Could not query videoViews:", viewsErr);
    }

    const getVideoViews = (v: any) => {
      return (viewCountMap[v.id] || 0) + (viewCountMap[v.youtubeId] || 0);
    };

    // 6. Compute 7-Day Trending List (Active lives first, followed by top 7-day viewed videos)
    const activeLives = allVideos
      .filter((v) => v.isLive === true)
      .sort((a, b) => {
        const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return timeB - timeA;
      });

    const nonLiveTrending = allVideos
      .filter((v) => !v.isLive)
      .sort((a, b) => {
        const viewsA = getVideoViews(a);
        const viewsB = getVideoViews(b);
        if (viewsB !== viewsA) {
          return viewsB - viewsA;
        }
        const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return timeB - timeA;
      });

    const rawTrending = [...activeLives, ...nonLiveTrending];
    const trendingVideos = rawTrending.filter((v) => !isChannelMatching(v, hiddenTrendingChannels));

    // 7. Featured Video Priority
    // If lives are running, feature the active live stream. Otherwise, feature the absolute latest video across all channels.
    // Exclude channels configured in hiddenFeaturedChannels.
    const eligibleLivesForFeatured = activeLives.filter((v) => !isChannelMatching(v, hiddenFeaturedChannels));
    const eligibleVideosForFeatured = allVideos.filter((v) => !isChannelMatching(v, hiddenFeaturedChannels));

    let featuredVideo: any = null;
    if (eligibleLivesForFeatured.length > 0) {
      featuredVideo = eligibleLivesForFeatured[0]; // Active live stream from eligible channel
    } else if (eligibleVideosForFeatured.length > 0) {
      featuredVideo = eligibleVideosForFeatured[0]; // Guaranteed latest video published across eligible channels
    }

    // 8. Map of allVideos by youtubeId for fast O(1) playlist hydration
    const videoMap = new Map<string, any>();
    allVideos.forEach((v) => {
      if (v.youtubeId) videoMap.set(v.youtubeId, v);
      if (v.id) videoMap.set(v.id, v);
    });

    // 9. Evaluate Custom Swimlanes (both "filter" and "playlist" types in configured order)
    const evaluatedSwimlanes = configuredSwimlanes.map((lane) => {
      // TYPE A: Curated Playlist
      if (lane.type === "playlist" && Array.isArray(lane.playlistVideos)) {
        let laneVideos = lane.playlistVideos
          .map((pv: any) => {
            const ytid = pv.youtubeId || pv.id;
            if (!ytid) return null;
            const existing = videoMap.get(ytid);
            if (existing) {
              return existing;
            }
            return {
              id: ytid,
              youtubeId: ytid,
              title: pv.title || `Video (${ytid})`,
              description: "",
              category: pv.channelTitle || "FTN+ Curated",
              thumbnailUrl:
                pv.thumbnailUrl || `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`,
              channelId: "",
              channelTitle: pv.channelTitle || "YouTube",
              channelLogoUrl: "",
              duration: "HD",
              isLive: false,
              publishedAt: new Date(),
            };
          })
          .filter(Boolean);

        // Deduplicate playlist lane items
        const seenLaneIds = new Set<string>();
        laneVideos = laneVideos.filter((v: any) => {
          const ytid = v.youtubeId || v.id;
          if (!ytid || seenLaneIds.has(ytid)) return false;
          seenLaneIds.add(ytid);
          return true;
        });

        if (lane.sortBy === "trending") {
          laneVideos = [...laneVideos].sort((a: any, b: any) => {
            const viewsA = getVideoViews(a);
            const viewsB = getVideoViews(b);
            if (viewsB !== viewsA) return viewsB - viewsA;
            const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
            const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
            return timeB - timeA;
          });
        } else if (lane.sortBy === "recent") {
          laneVideos = [...laneVideos].sort((a: any, b: any) => {
            const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
            const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
            return timeB - timeA;
          });
        }

        return {
          id: lane.id,
          title: lane.title,
          type: "playlist",
          videos: laneVideos.slice(0, 40),
        };
      }

      // TYPE B: Dynamic Filter (Channel & Keyword / Regex Matching)
      let laneVideos = allVideos.filter((v) => {
        // Multi-channel matching (supports comma-separated handles, IDs, or titles)
        if (lane.channel && typeof lane.channel === "string" && lane.channel.trim() && lane.channel.trim().toUpperCase() !== "ALL") {
          const rawTokens = lane.channel.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean);
          if (rawTokens.length > 0) {
            const vChanId = (v.channelId || "").toLowerCase();
            const vChanTitle = (v.channelTitle || "").toLowerCase();
            const vChanHandle = (v.channelHandle || "").toLowerCase().replace(/^@/, "");
            const vChanTitleAlpha = vChanTitle.replace(/[^a-z0-9]/g, "");

            const matchesAnyToken = rawTokens.some((token: string) => {
              const cleanToken = token.replace(/^@/, "");
              const tokenAlpha = cleanToken.replace(/[^a-z0-9]/g, "");
              if (!cleanToken) return false;

              // Exact or substring match on Handle (e.g. ftntv)
              if (vChanHandle === cleanToken || vChanHandle.includes(cleanToken)) return true;
              // Exact or substring match on ID (e.g. UC...)
              if (vChanId === cleanToken || vChanId.includes(cleanToken)) return true;
              // Title substring match
              if (vChanTitle.includes(cleanToken) || cleanToken.includes(vChanTitle)) return true;
              // Alpha-numeric match (e.g. "ftntv" matches "FTN TV" or "FTN Television")
              if (tokenAlpha && (vChanTitleAlpha.includes(tokenAlpha) || tokenAlpha.includes(vChanTitleAlpha))) return true;

              return false;
            });

            if (!matchesAnyToken) {
              return false;
            }
          }
        }

        // Keyword / Regex Title and Description Match
        if (lane.regexPattern && typeof lane.regexPattern === "string" && lane.regexPattern.trim()) {
          try {
            const regex = new RegExp(lane.regexPattern.trim(), "i");
            const matchTitle = regex.test(v.title || "");
            const matchDesc = v.description ? regex.test(v.description) : false;
            if (!matchTitle && !matchDesc) {
              return false;
            }
          } catch {
            // Fallback to plain keyword matching if invalid regex syntax
            const kw = lane.regexPattern.trim().toLowerCase();
            const hasTitle = (v.title || "").toLowerCase().includes(kw);
            const hasDesc = (v.description || "").toLowerCase().includes(kw);
            if (!hasTitle && !hasDesc) return false;
          }
        }

        return true;
      });

      // Deduplicate filter lane items
      const seenFilterLaneIds = new Set<string>();
      laneVideos = laneVideos.filter((v: any) => {
        const ytid = v.youtubeId || v.id;
        if (!ytid || seenFilterLaneIds.has(ytid)) return false;
        seenFilterLaneIds.add(ytid);
        return true;
      });

      // Sort by recent or trending
      if (lane.sortBy === "trending") {
        laneVideos = [...laneVideos].sort((a, b) => {
          const viewsA = getVideoViews(a);
          const viewsB = getVideoViews(b);
          if (viewsB !== viewsA) {
            return viewsB - viewsA;
          }
          const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return timeB - timeA;
        });
      } else {
        laneVideos = [...laneVideos].sort((a, b) => {
          const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return timeB - timeA;
        });
      }

      return {
        id: lane.id,
        title: lane.title,
        type: "filter",
        videos: laneVideos.slice(0, 40),
      };
    });

    return NextResponse.json({
      videos: allVideos,
      featuredVideo,
      trendingVideos: trendingVideos.slice(0, 40),
      customSwimlanes: evaluatedSwimlanes.filter((s) => s.videos.length > 0),
      ftnPlusAccess,
      allowSignIn,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (error: any) {
    console.error("Plus videos error:", error);
    try {
      const d1 = (process.env as any).DB as D1Database;
      if (d1) {
        const db = getDb(d1);
        const fallbackVideos = await db.select().from(videos).orderBy(desc(videos.publishedAt)).limit(40);
        return NextResponse.json({
          videos: fallbackVideos,
          featuredVideo: fallbackVideos[0] || null,
          trendingVideos: fallbackVideos.slice(0, 20),
          customSwimlanes: [],
          ftnPlusAccess: "public",
          allowSignIn: true,
        });
      }
    } catch {}
    return NextResponse.json({
      videos: [],
      featuredVideo: null,
      trendingVideos: [],
      customSwimlanes: [],
      ftnPlusAccess: "public",
      allowSignIn: true,
    });
  }
}
