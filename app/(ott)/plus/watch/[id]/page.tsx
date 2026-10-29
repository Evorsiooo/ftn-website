export const runtime = "edge";
import React from "react";
import type { Metadata } from "next";
import { getDb } from "@/db";
import { siteSettings, videos } from "@/db/schema";
import { and, eq, like, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { OTTPlayer } from "@/components/ott/ott-player";
import { findTwitchBroadcast, parseTwitchId, twitchBroadcastId } from "@/lib/twitch";
import { publicVideoId, resolvePublicTwitchId } from "@/lib/twitch-id";

// Watch URLs use one public id format for every video. A Twitch broadcast's public id is turned back into
// its internal id here, unless a video row already uses that id (a YouTube video).
async function resolveWatchId(id: string): Promise<string> {
  if (parseTwitchId(id) || !/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return id;
    const db = getDb(d1);
    const known = await db.select({ id: videos.id }).from(videos).where(or(eq(videos.youtubeId, id), eq(videos.id, id))).limit(1);
    if (known.length > 0) return id;
    const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, "main_config")).limit(1);
    const list = rows.length ? JSON.parse(rows[0].valueJson).twitchChannels : [];
    const logins = Array.isArray(list) ? list.filter((c: unknown): c is string => typeof c === "string") : [];
    const t = resolvePublicTwitchId(id, logins.map((l) => l.replace(/^@/, "").toLowerCase()));
    return t ? twitchBroadcastId(t.login, t.streamId) : id;
  } catch {
    return id;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  const id = await resolveWatchId(rawId);
  let targetYoutubeId = id || "";
  let videoTitle = "FTN Broadcast Stream";
  let videoDescription = "";
  let channelTitle = "";
  let thumbnailUrl = `https://img.youtube.com/vi/${targetYoutubeId}/hqdefault.jpg`;

  try {
    const d1 = (process.env as any).DB as D1Database;
    if (d1) {
      const db = getDb(d1);
      const match = await db
        .select()
        .from(videos)
        .where(or(eq(videos.youtubeId, id), eq(videos.id, id)))
        .limit(1);

      if (match.length > 0) {
        targetYoutubeId = match[0].youtubeId;
        videoTitle = match[0].title;
        channelTitle = match[0].channelTitle || "";
        const rawDesc = match[0].description || "";
        // Strip legacy hardcoded boilerplate if present in old database rows
        if (
          !rawDesc.startsWith("Official high-definition stream broadcast from FTN Media Network")
        ) {
          videoDescription = rawDesc;
        }
        thumbnailUrl = match[0].thumbnailUrl || thumbnailUrl;
      }
    }
  } catch {}

  // Fallback metadata resolution for external/curated videos
  if (videoTitle === "FTN Broadcast Stream" && targetYoutubeId && !parseTwitchId(targetYoutubeId)) {
    try {
      const oembedRes = await fetch(
        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${targetYoutubeId}`
      );
      if (oembedRes.ok) {
        const oembed = (await oembedRes.json()) as any;
        if (oembed.title) videoTitle = oembed.title;
        if (oembed.author_name) channelTitle = oembed.author_name;
      }
    } catch {}
  }

  // Discord / Social card description fallback so rich embed remains intact
  const metaDescription = videoDescription
    ? videoDescription.slice(0, 200)
    : channelTitle
    ? `Watch ${videoTitle} from ${channelTitle} on FTN+.`
    : `Watch ${videoTitle} on FTN+.`;

  return {
    title: {
      absolute: `${videoTitle} | FTN+`,
    },
    description: metaDescription,
    openGraph: {
      title: `${videoTitle} | FTN+`,
      description: metaDescription,
      siteName: "FTN News Network",
      type: "video.other",
      images: [
        {
          url: thumbnailUrl,
          width: 1280,
          height: 720,
          alt: videoTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${videoTitle} | FTN+`,
      description: metaDescription,
      images: [thumbnailUrl],
    },
    other: {
      "theme-color": "#FFBB14",
    },
  };
}

export default async function OTTWatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = await resolveWatchId(rawId);
  let targetYoutubeId = id || "";
  let videoTitle = "FTN Broadcast Stream";
  let videoDescription = "";
  let videoCategory = "FTN+ OTT";
  let channelId = "";
  let channelTitle = "";
  let channelLogoUrl = "";
  let publishedAt: string | undefined = undefined;
  let isLive = false;
  let twitchVodId: string | undefined;
  let broadcastEnded = false;
  const twitch = parseTwitchId(id);
  let foundRow = false;
  let redirectTo: string | null = null;

  try {
    const d1 = (process.env as any).DB as D1Database;
    if (d1) {
      const db = getDb(d1);
      const match = await db
        .select()
        .from(videos)
        .where(or(eq(videos.youtubeId, id), eq(videos.id, id)))
        .limit(1);

      if (match.length > 0) {
        foundRow = true;
        targetYoutubeId = match[0].youtubeId;
        videoTitle = match[0].title;
        const rawDesc = match[0].description || "";
        // Strip legacy hardcoded boilerplate if present in old database rows
        if (
          !rawDesc.startsWith("Official high-definition stream broadcast from FTN Media Network")
        ) {
          videoDescription = rawDesc;
        }
        videoCategory = match[0].channelTitle || videoCategory;
        channelId = match[0].channelId;
        channelTitle = match[0].channelTitle;
        channelLogoUrl = match[0].channelLogoUrl || "";
        isLive = match[0].isLive || false;
        if (match[0].publishedAt) {
          publishedAt = new Date(match[0].publishedAt).toISOString();
        }

        // Real-time verification against YouTube; Twitch lives are kept current by the Twitch sync instead.
        if (isLive && !twitch && process.env.YOUTUBE_API_KEY) {
          try {
            const verifyRes = await fetch(
              `https://www.googleapis.com/youtube/v3/videos?key=${process.env.YOUTUBE_API_KEY}&id=${targetYoutubeId}&part=snippet`
            );
            if (verifyRes.ok) {
              const vData = (await verifyRes.json()) as any;
              const liveContent = vData.items?.[0]?.snippet?.liveBroadcastContent;
              if (liveContent !== "live") {
                isLive = false;
                await db.update(videos).set({ isLive: false }).where(eq(videos.youtubeId, targetYoutubeId));
              }
            }
          } catch {}
        }
      }
    }
  } catch {}

  if (twitch && !foundRow) {
    if (!twitch.streamId) {
      // An old per-channel link: send it to the channel's current broadcast if it is live.
      try {
        const d1 = (process.env as any).DB as D1Database;
        if (d1) {
          const db = getDb(d1);
          const live = await db
            .select({ id: videos.id })
            .from(videos)
            .where(and(like(videos.id, `twitch_${twitch.login}-%`), eq(videos.isLive, true)))
            .limit(1);
          if (live.length > 0) redirectTo = `/plus/watch/${publicVideoId(live[0].id)}`;
        }
      } catch {}
    } else {
      // A finished broadcast: its row is gone, so its recording is looked up on Twitch.
      broadcastEnded = true;
      const found = await findTwitchBroadcast(twitch.login, twitch.streamId);
      if (found) {
        twitchVodId = found.vodId;
        videoTitle = found.title;
        channelTitle = found.channelTitle;
        channelId = twitch.login;
        channelLogoUrl = found.channelLogoUrl || "";
        videoCategory = found.channelTitle;
        if (found.startedAt) publishedAt = new Date(found.startedAt).toISOString();
      } else {
        videoTitle = `${twitch.login} broadcast`;
        channelTitle = twitch.login;
        channelId = twitch.login;
      }
    }
  }

  // The old `twitch_<login>-<stream id>` link: same page, shared URL format.
  if (!redirectTo && twitch?.streamId && rawId === id && publicVideoId(id) !== id) redirectTo = `/plus/watch/${publicVideoId(id)}`;
  if (redirectTo) redirect(redirectTo);

  // Fallback metadata resolution for external/curated videos
  if (videoTitle === "FTN Broadcast Stream" && targetYoutubeId && !twitch) {
    try {
      const oembedRes = await fetch(
        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${targetYoutubeId}`
      );
      if (oembedRes.ok) {
        const oembed = (await oembedRes.json()) as any;
        if (oembed.title) videoTitle = oembed.title;
        if (oembed.author_name) channelTitle = oembed.author_name;
      }
    } catch {}
  }

  return (
    <OTTPlayer
      youtubeId={targetYoutubeId}
      title={videoTitle}
      description={videoDescription}
      category={videoCategory}
      channelId={channelId}
      channelTitle={channelTitle}
      channelLogoUrl={channelLogoUrl}
      publishedAt={publishedAt}
      isLive={isLive}
      twitchVodId={twitchVodId}
      broadcastEnded={broadcastEnded}
    />
  );
}
