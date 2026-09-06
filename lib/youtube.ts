import { DbClient } from "@/db";
import { videos } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface YouTubeVideoItem {
  id: string;
  youtubeId: string;
  channelId: string;
  channelTitle: string;
  channelHandle?: string;
  channelLogoUrl?: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: Date;
  videoType: "video" | "livestream" | "podcast";
  isLive: boolean;
  durationSeconds: number;
}

/**
 * Normalizes any user-entered channel string (full URL, handle with/without @, UC channel ID, custom URL).
 */
export function normalizeYouTubeChannelInput(input: string): {
  type: "id" | "handle" | "username";
  value: string;
  raw: string;
} {
  let clean = input.trim();
  clean = clean.split("?")[0].replace(/\/+$/, "");

  // 1. Full YouTube URL with handle: e.g. https://www.youtube.com/@channelName or youtube.com/@channelName
  const handleUrlMatch = clean.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/@([a-zA-Z0-9_\-\.]+)/i);
  if (handleUrlMatch) {
    return { type: "handle", value: handleUrlMatch[1], raw: input };
  }

  // 2. Full YouTube URL with Channel ID: e.g. https://www.youtube.com/channel/(UC...)
  const channelUrlMatch = clean.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/channel\/(UC[a-zA-Z0-9_\-]{22})/i);
  if (channelUrlMatch) {
    return { type: "id", value: channelUrlMatch[1], raw: input };
  }

  // 3. Full YouTube URL with /c/ or /user/: e.g. https://www.youtube.com/c/name or /user/name
  const customUrlMatch = clean.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:c|user)\/([a-zA-Z0-9_\-\.]+)/i);
  if (customUrlMatch) {
    return { type: "username", value: customUrlMatch[1], raw: input };
  }

  // 4. Handle starting with @ (e.g. @FTNMedia)
  if (clean.startsWith("@")) {
    return { type: "handle", value: clean.slice(1), raw: input };
  }

  // 5. Raw 24-character Channel ID starting with UC (e.g. UC_x5XG1OV2P6uZZ5FSM9Ttw)
  if (/^UC[a-zA-Z0-9_\-]{22}$/.test(clean)) {
    return { type: "id", value: clean, raw: input };
  }

  // 6. Generic string fallback (treated as handle or username)
  return { type: "handle", value: clean, raw: input };
}

/**
 * Scrapes a YouTube channel's public page to resolve its Canonical Channel ID (UC...), Title, Handle, and Logo.
 * Completely free, 0 API key required, and 100% reliable for any handle or URL.
 */
export async function resolveChannelFromPublicWeb(channelInput: string): Promise<{
  channelId: string;
  channelTitle: string;
  channelHandle?: string;
  channelLogoUrl?: string;
  uploadsPlaylistId?: string;
} | null> {
  const norm = normalizeYouTubeChannelInput(channelInput);
  let targetUrl = "";

  if (norm.type === "id") {
    targetUrl = `https://www.youtube.com/channel/${norm.value}`;
  } else if (norm.type === "handle") {
    targetUrl = `https://www.youtube.com/@${norm.value.replace(/^@/, "")}`;
  } else if (norm.type === "username") {
    targetUrl = `https://www.youtube.com/c/${norm.value}`;
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    // 1. Channel ID (itemprop="channelId", /channel/UC..., "channelId":"UC...")
    let channelId = "";
    const idMatch1 = html.match(/<meta\s+itemprop="channelId"\s+content="(UC[a-zA-Z0-9_\-]{22})"/i);
    const idMatch2 = html.match(/"channelId":\s*"(UC[a-zA-Z0-9_\-]{22})"/i);
    const idMatch3 = html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_\-]{22})/i);
    const idMatch4 = html.match(/<meta\s+itemprop="identifier"\s+content="(UC[a-zA-Z0-9_\-]{22})"/i);

    channelId =
      idMatch1?.[1] || idMatch2?.[1] || idMatch3?.[1] || idMatch4?.[1] || (norm.type === "id" ? norm.value : "");
    if (!channelId) return null;

    // 2. Channel Title (og:title, title tag)
    const titleMatch =
      html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
    let channelTitle = titleMatch ? titleMatch[1].replace(/ - YouTube$/, "").trim() : "YouTube Channel";

    // 3. Channel Avatar / Logo (og:image)
    const logoMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    const channelLogoUrl = logoMatch ? logoMatch[1] : undefined;

    // 4. Channel Handle
    const handleMatch = html.match(/https:\/\/www\.youtube\.com\/@([a-zA-Z0-9_\-\.]+)/i);
    const channelHandle = handleMatch
      ? `@${handleMatch[1]}`
      : norm.type === "handle"
      ? `@${norm.value.replace(/^@/, "")}`
      : undefined;

    const uploadsPlaylistId = `UU${channelId.slice(2)}`;

    return {
      channelId,
      channelTitle,
      channelHandle,
      channelLogoUrl,
      uploadsPlaylistId,
    };
  } catch (err) {
    console.warn("Public web channel scrape error:", err);
    return null;
  }
}

/**
 * Resolves a channel input into its exact Channel ID, Title, Avatar Logo, Handle, and Uploads Playlist ID.
 */
export async function resolveYouTubeChannel(
  channelInput: string,
  key?: string
): Promise<{
  channelId: string;
  channelTitle: string;
  channelHandle?: string;
  channelLogoUrl?: string;
  uploadsPlaylistId?: string;
} | null> {
  const norm = normalizeYouTubeChannelInput(channelInput);

  // 1. Try Google API if key is present
  if (key) {
    try {
      let chanData: any = null;

      if (norm.type === "id") {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?key=${key}&id=${encodeURIComponent(
            norm.value
          )}&part=id,snippet,contentDetails`
        );
        if (res.ok) chanData = (await res.json()) as any;
      } else if (norm.type === "handle") {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?key=${key}&forHandle=${encodeURIComponent(
            norm.value
          )}&part=id,snippet,contentDetails`
        );
        if (res.ok) {
          chanData = (await res.json()) as any;
        }

        if (!chanData?.items?.[0]) {
          const userRes = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?key=${key}&forUsername=${encodeURIComponent(
              norm.value
            )}&part=id,snippet,contentDetails`
          );
          if (userRes.ok) chanData = (await userRes.json()) as any;
        }
      } else if (norm.type === "username") {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?key=${key}&forUsername=${encodeURIComponent(
            norm.value
          )}&part=id,snippet,contentDetails`
        );
        if (res.ok) chanData = (await res.json()) as any;
      }

      if (chanData?.items?.[0]) {
        const item = chanData.items[0];
        const chanId = item.id;
        const chanTitle = item.snippet?.title || "YouTube Channel";
        const chanHandle = item.snippet?.customUrl || (norm.type === "handle" ? `@${norm.value}` : undefined);
        const chanLogo =
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url;
        const uploadsPlaylist =
          item.contentDetails?.relatedPlaylists?.uploads ||
          (chanId.startsWith("UC") ? `UU${chanId.slice(2)}` : undefined);

        return {
          channelId: chanId,
          channelTitle: chanTitle,
          channelHandle: chanHandle,
          channelLogoUrl: chanLogo,
          uploadsPlaylistId: uploadsPlaylist,
        };
      }
    } catch (apiErr) {
      console.warn("Google API channel resolution error, falling back to public web scraper:", apiErr);
    }
  }

  // 2. Direct Public Web Scrape Fallback (Zero API Key requirement)
  const webResolved = await resolveChannelFromPublicWeb(channelInput);
  if (webResolved) {
    return webResolved;
  }

  // 3. Fallback: If input is a 24-character UC ID, construct default uploads playlist
  if (norm.value.startsWith("UC") && norm.value.length === 24) {
    return {
      channelId: norm.value,
      channelTitle: "YouTube Channel",
      uploadsPlaylistId: `UU${norm.value.slice(2)}`,
    };
  }

  return null;
}

/**
 * Fetches and parses a YouTube channel's public XML RSS feed.
 * Completely free, zero API key, zero quota, and updates immediately for any channel ID.
 */
async function fetchChannelRssFeed(
  channelId: string,
  channelTitleFallback?: string,
  channelLogoFallback?: string
): Promise<YouTubeVideoItem[]> {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!res.ok) return [];

    const xml = await res.text();
    const items: YouTubeVideoItem[] = [];

    // Extract channel title
    const chanTitleMatch = xml.match(/<author>\s*<name>([^<]+)<\/name>/i);
    const channelTitle = chanTitleMatch ? chanTitleMatch[1].trim() : channelTitleFallback || "YouTube Channel";

    // Split entries
    const entries = xml.split("<entry>").slice(1);

    for (const entry of entries) {
      const vidIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i);
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/i);
      const publishedMatch = entry.match(/<published>([^<]+)<\/published>/i);
      const descMatch = entry.match(/<media:description>([^<]*)<\/media:description>/i);

      if (vidIdMatch) {
        const ytid = vidIdMatch[1].trim();
        const title = titleMatch ? titleMatch[1].trim() : `Video (${ytid})`;
        const publishedAt = publishedMatch ? new Date(publishedMatch[1].trim()) : new Date();
        const description = descMatch ? descMatch[1].trim() : "";

        items.push({
          id: crypto.randomUUID(),
          youtubeId: ytid,
          channelId,
          channelTitle,
          channelLogoUrl: channelLogoFallback,
          thumbnailUrl: `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`,
          title,
          description,
          publishedAt,
          videoType: "video",
          isLive: false,
          durationSeconds: 0,
        });
      }
    }

    return items;
  } catch (err) {
    console.warn("RSS feed fetch error for channel:", channelId, err);
    return [];
  }
}

/**
 * Verifies if any videos currently marked isLive: true in DB are still genuinely live on YouTube.
 * If a stream has finished, immediately unsets isLive: false in D1.
 */
export async function verifyActiveLives(
  db: DbClient,
  liveVideos: any[],
  apiKey?: string
): Promise<any[]> {
  const key = apiKey || process.env.YOUTUBE_API_KEY;
  if (!key || liveVideos.length === 0) return liveVideos;

  const liveIds = Array.from(new Set(liveVideos.map((v) => v.youtubeId).filter(Boolean)));
  if (liveIds.length === 0) return liveVideos;

  try {
    const videosRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?key=${key}&id=${liveIds.join(
        ","
      )}&part=snippet,liveStreamingDetails`
    );

    if (!videosRes.ok) return liveVideos;

    const data = (await videosRes.json()) as any;
    const items = Array.isArray(data.items) ? data.items : [];
    const liveMap = new Map<string, boolean>();

    items.forEach((item: any) => {
      const isStillLive = item.snippet?.liveBroadcastContent === "live";
      liveMap.set(item.id, isStillLive);
    });

    for (const lv of liveVideos) {
      const isGenuineLive = liveMap.get(lv.youtubeId) === true;
      if (!isGenuineLive) {
        await db.update(videos).set({ isLive: false }).where(eq(videos.id, lv.id));
        lv.isLive = false;
      }
    }
  } catch (err) {
    console.warn("Live status verification error:", err);
  }

  return liveVideos;
}

/**
 * Synchronizes a YouTube channel feed into Cloudflare D1.
 * Uses official Uploads playlist (zero indexing delay, 1 quota unit), active livestream search,
 * batch metadata hydration, and seamless RSS feed fallback.
 */
export async function syncYouTubeChannel(
  db: DbClient,
  channelInput: string,
  apiKey?: string
): Promise<number> {
  const key = apiKey || process.env.YOUTUBE_API_KEY;
  if (!channelInput || channelInput === "FTN_OFFICIAL") {
    return 0;
  }

  try {
    // 1. Resolve channel metadata and Uploads Playlist ID
    const resolved = await resolveYouTubeChannel(channelInput, key);
    if (!resolved) {
      console.warn(`Could not resolve YouTube channel: ${channelInput}`);
      return 0;
    }

    const { channelId, channelTitle, channelHandle, channelLogoUrl, uploadsPlaylistId } = resolved;

    // Update existing videos in DB with latest channel info (avatar, title, handle)
    if (channelLogoUrl || channelTitle || channelHandle) {
      const updateData: any = {};
      if (channelLogoUrl) updateData.channelLogoUrl = channelLogoUrl;
      if (channelTitle) updateData.channelTitle = channelTitle;
      if (channelHandle) updateData.channelHandle = channelHandle;
      try {
        await db.update(videos).set(updateData).where(eq(videos.channelId, channelId));
      } catch {}
    }

    let collectedVideoIds = new Set<string>();
    let videoItems: YouTubeVideoItem[] = [];

    // 2. Fetch recent videos from the channel's Uploads Playlist (1 quota unit, 0 search delay)
    if (key && uploadsPlaylistId) {
      try {
        const playlistRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?key=${key}&playlistId=${encodeURIComponent(
            uploadsPlaylistId
          )}&part=snippet,contentDetails&maxResults=50`
        );

        if (playlistRes.ok) {
          const playlistData = (await playlistRes.json()) as any;
          (playlistData.items || []).forEach((item: any) => {
            const vidId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
            if (vidId) collectedVideoIds.add(vidId);
          });
        }
      } catch (plErr) {
        console.warn("Uploads playlist fetch error:", plErr);
      }
    }

    // 3. Specifically query for active ongoing livestream broadcasts
    if (key && channelId) {
      try {
        const liveRes = await fetch(
          `https://www.googleapis.com/youtube/v3/search?key=${key}&channelId=${encodeURIComponent(
            channelId
          )}&part=id&eventType=live&type=video&maxResults=5`
        );
        if (liveRes.ok) {
          const liveData = (await liveRes.json()) as any;
          (liveData.items || []).forEach((item: any) => {
            if (item.id?.videoId) collectedVideoIds.add(item.id.videoId);
          });
        }
      } catch (liveErr) {
        console.warn("Live search error:", liveErr);
      }
    }

    // 4. If YouTube Data API yielded video IDs, batch hydrate full metadata
    const allVideoIds = Array.from(collectedVideoIds);
    if (key && allVideoIds.length > 0) {
      try {
        // Chunk into batches of 50 (YouTube API limit)
        for (let i = 0; i < allVideoIds.length; i += 50) {
          const chunk = allVideoIds.slice(i, i + 50);
          const videosRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?key=${key}&id=${chunk.join(
              ","
            )}&part=snippet,liveStreamingDetails,contentDetails`
          );

          if (videosRes.ok) {
            const videosData = (await videosRes.json()) as any;
            if (Array.isArray(videosData.items)) {
              videosData.items.forEach((item: any) => {
                const isLive = item.snippet?.liveBroadcastContent === "live";
                const isUpcoming = item.snippet?.liveBroadcastContent === "upcoming";
                if (isUpcoming) return; // Skip upcoming unscheduled placeholders

                const isStream = isLive || Boolean(item.liveStreamingDetails);
                const videoType = isLive ? "livestream" : isStream ? "livestream" : "video";

                const thumb =
                  item.snippet?.thumbnails?.maxres?.url ||
                  item.snippet?.thumbnails?.standard?.url ||
                  item.snippet?.thumbnails?.high?.url ||
                  item.snippet?.thumbnails?.medium?.url ||
                  item.snippet?.thumbnails?.default?.url ||
                  `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`;

                // For livestreams, actualStartTime provides the exact broadcast start timestamp
                const actualStart = item.liveStreamingDetails?.actualStartTime;
                const publishedAt = actualStart
                  ? new Date(actualStart)
                  : new Date(item.snippet?.publishedAt || Date.now());

                videoItems.push({
                  id: crypto.randomUUID(),
                  youtubeId: item.id,
                  channelId,
                  channelTitle: channelTitle || item.snippet?.channelTitle || "FTN Network",
                  channelHandle,
                  channelLogoUrl,
                  title: item.snippet?.title || `Video (${item.id})`,
                  description: item.snippet?.description || "",
                  thumbnailUrl: thumb,
                  publishedAt,
                  videoType,
                  isLive,
                  durationSeconds: 0,
                });
              });
            }
          }
        }
      } catch (batchErr) {
        console.warn("Batch video metadata error:", batchErr);
      }
    }

    // 5. Seamless Zero-Quota RSS Feed Fallback if API returned 0 items
    if (videoItems.length === 0 && channelId) {
      console.log(`Using RSS feed fallback for channel ${channelId}`);
      videoItems = await fetchChannelRssFeed(channelId, channelTitle, channelLogoUrl);
    }

    if (videoItems.length === 0) {
      return 0;
    }

    let syncedCount = 0;

    // 6. Upsert videos into Cloudflare D1
    for (const item of videoItems) {
      const existing = await db
        .select()
        .from(videos)
        .where(eq(videos.youtubeId, item.youtubeId))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(videos).values({
          id: item.id,
          youtubeId: item.youtubeId,
          channelId: item.channelId,
          channelTitle: item.channelTitle,
          channelHandle: item.channelHandle || null,
          channelLogoUrl: item.channelLogoUrl || null,
          title: item.title,
          description: item.description,
          thumbnailUrl: item.thumbnailUrl,
          publishedAt: item.publishedAt,
          videoType: item.videoType,
          isLive: item.isLive,
          durationSeconds: item.durationSeconds,
          createdAt: new Date(),
        });
        syncedCount++;
      } else {
        await db
          .update(videos)
          .set({
            isLive: item.isLive,
            title: item.title,
            description: item.description ?? "",
            thumbnailUrl: item.thumbnailUrl || existing[0].thumbnailUrl,
            channelLogoUrl: item.channelLogoUrl || existing[0].channelLogoUrl,
            channelTitle: item.channelTitle || existing[0].channelTitle,
            channelHandle: item.channelHandle || existing[0].channelHandle || null,
            publishedAt: item.publishedAt,
            videoType: item.videoType,
          })
          .where(eq(videos.id, existing[0].id));
      }
    }

    // 7. Clean up stale live status for ended broadcasts in this channel
    try {
      const activeLiveYoutubeIds = new Set(
        videoItems.filter((v) => v.isLive).map((v) => v.youtubeId)
      );
      const staleLivesInDb = await db
        .select()
        .from(videos)
        .where(and(eq(videos.channelId, channelId), eq(videos.isLive, true)));

      for (const stale of staleLivesInDb) {
        if (!activeLiveYoutubeIds.has(stale.youtubeId)) {
          await db.update(videos).set({ isLive: false }).where(eq(videos.id, stale.id));
        }
      }
    } catch (cleanupErr) {
      console.warn("Stale lives cleanup error:", cleanupErr);
    }

    return syncedCount;
  } catch (err) {
    console.error(`Failed to sync channel ${channelInput}:`, err);
    return 0;
  }
}
