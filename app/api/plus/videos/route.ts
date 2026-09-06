import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { videos, videoViews, siteSettings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { syncYouTubeChannel, verifyActiveLives } from "@/lib/youtube";

export const runtime = "edge";

export async function GET(request: NextRequest) {
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

    // 2. Automated sync: Auto-sync configured channels every 60 seconds
    const now = Date.now();
    const SYNC_INTERVAL_MS = 60 * 1000; // 60 seconds (1 minute fast sync)

    if (configuredChannels.length > 0) {
      let lastSyncTime = 0;
      try {
        const syncRow = await db
          .select()
          .from(siteSettings)
          .where(eq(siteSettings.key, "youtube_last_sync"))
          .limit(1);

        if (syncRow.length > 0) {
          try {
            lastSyncTime = Number(syncRow[0].valueJson) || 0;
          } catch {}
        }

        if (now - lastSyncTime > SYNC_INTERVAL_MS) {
          // Record timestamp lock immediately with conflict protection
          const strNow = String(now);
          if (syncRow.length > 0) {
            try {
              await db
                .update(siteSettings)
                .set({ valueJson: strNow, updatedAt: new Date() })
                .where(eq(siteSettings.key, "youtube_last_sync"));
            } catch {}
          } else {
            try {
              await db.insert(siteSettings).values({
                key: "youtube_last_sync",
                valueJson: strNow,
                updatedAt: new Date(),
              });
            } catch {
              try {
                await db
                  .update(siteSettings)
                  .set({ valueJson: strNow, updatedAt: new Date() })
                  .where(eq(siteSettings.key, "youtube_last_sync"));
              } catch {}
            }
          }

          // Execute channel sync across all configured channels
          const syncPromise = (async () => {
            for (const chan of configuredChannels) {
              try {
                await syncYouTubeChannel(db, chan);
              } catch (err) {
                console.warn(`Auto-sync error for ${chan}:`, err);
              }
            }
          })();

          // Ensure Cloudflare Edge Worker keeps the execution context alive
          try {
            if ((request as any)?.waitUntil) {
              (request as any).waitUntil(syncPromise);
            } else {
              await Promise.race([
                syncPromise,
                new Promise((resolve) => setTimeout(resolve, 1500)),
              ]);
            }
          } catch {
            await Promise.race([
              syncPromise,
              new Promise((resolve) => setTimeout(resolve, 1500)),
            ]);
          }
        }
      } catch (syncErr) {
        console.warn("Auto-sync check bypassed:", syncErr);
      }
    }

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

    // 4. Real-time Live Status Verification: If any video is marked isLive, verify with YouTube API in background
    try {
      const activeLivesInDb = rawVideos.filter((v) => v.isLive === true);
      if (activeLivesInDb.length > 0 && process.env.YOUTUBE_API_KEY) {
        const verifyPromise = verifyActiveLives(db, activeLivesInDb).catch((err) => {
          console.warn("Live verification error:", err);
        });
        if ((request as any)?.waitUntil) {
          (request as any).waitUntil(verifyPromise);
        }
      }
    } catch (liveErr) {
      console.warn("Live check error:", liveErr);
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

    // 5. Fetch all recorded video views and compute past 7-day counts
    let allViews: any[] = [];
    try {
      allViews = await db
        .select({
          videoId: videoViews.videoId,
          viewedAt: videoViews.viewedAt,
        })
        .from(videoViews);
    } catch (viewsErr) {
      console.warn("Could not query videoViews:", viewsErr);
    }

    const sevenDaysAgoTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const viewCountMap: Record<string, number> = {};

    allViews.forEach((v) => {
      let vTime = 0;
      if (v.viewedAt instanceof Date) {
        vTime = v.viewedAt.getTime();
      } else if (typeof v.viewedAt === "number") {
        vTime = v.viewedAt;
      } else if (v.viewedAt) {
        vTime = new Date(v.viewedAt).getTime();
      }

      if (!vTime || isNaN(vTime) || vTime >= sevenDaysAgoTime) {
        viewCountMap[v.videoId] = (viewCountMap[v.videoId] || 0) + 1;
      }
    });

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

    const trendingVideos = [...activeLives, ...nonLiveTrending];

    // 7. Featured Video Priority
    // If lives are running, feature the active live stream. Otherwise, feature the absolute latest video across all channels.
    let featuredVideo: any = null;
    if (activeLives.length > 0) {
      featuredVideo = activeLives[0]; // Active live stream
    } else if (allVideos.length > 0) {
      featuredVideo = allVideos[0]; // Guaranteed latest video published across all channels
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
