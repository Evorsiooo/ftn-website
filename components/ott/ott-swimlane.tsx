"use client";
import React from "react";
import { Lane, MediaCard, ChannelAvatar } from "@/components/ftn/media";

export interface SwimlaneVideo {
  id: string;
  title: string;
  category: string;
  thumbnailUrl: string;
  channelId?: string;
  channelTitle?: string;
  channelLogoUrl?: string;
  duration?: string;
  isLive?: boolean;
}

export function OTTSwimlane({
  title,
  videos,
  href,
  hrefLabel,
}: {
  title: string;
  videos: SwimlaneVideo[];
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div style={{ contentVisibility: "auto", containIntrinsicSize: "0 300px" }}>
      <Lane title={title} href={href} hrefLabel={hrefLabel}>
        {videos.map((video) => (
          <MediaCard
            key={video.id}
            href={`/plus/watch/${video.id}`}
            art={video.thumbnailUrl}
            title={video.title}
            badge={video.isLive ? "LIVE" : undefined}
            badgeLive
            showPlay
            className="w-64 sm:w-72 md:w-80"
            lead={
              <ChannelAvatar
                logoUrl={video.channelLogoUrl}
                title={video.channelTitle}
                channelId={video.channelId}
                fallbackText={video.channelTitle}
              />
            }
          />
        ))}
      </Lane>
    </div>
  );
}
