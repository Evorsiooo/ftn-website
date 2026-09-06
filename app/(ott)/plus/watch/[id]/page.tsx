export const runtime = "edge";
import React from "react";
import type { Metadata } from "next";
import { getDb } from "@/db";
import { videos } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { OTTPlayer } from "@/components/ott/ott-player";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
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
  if (videoTitle === "FTN Broadcast Stream" && targetYoutubeId) {
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
  const { id } = await params;
  let targetYoutubeId = id || "";
  let videoTitle = "FTN Broadcast Stream";
  let videoDescription = "";
  let videoCategory = "FTN+ OTT";
  let channelId = "";
  let channelTitle = "";
  let channelLogoUrl = "";
  let publishedAt: string | undefined = undefined;
  let isLive = false;

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

        // Real-time verification if video is marked isLive
        if (isLive && process.env.YOUTUBE_API_KEY) {
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

  // Fallback metadata resolution for external/curated videos
  if (videoTitle === "FTN Broadcast Stream" && targetYoutubeId) {
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
    />
  );
}
