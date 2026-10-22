"use client";
import React, { useRef } from "react";
import Link from "next/link";
import { IconArrowNarrowLeft, IconArrowNarrowRight, IconPlayerPlay } from "@tabler/icons-react";

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
}: {
  title: string;
  videos: SwimlaneVideo[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const offset = direction === "left" ? -400 : 400;
      scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  return (
    <div
      className="w-full py-4 space-y-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 280px" }}
    >
      {/* Swimlane Header */}
      <div className="flex items-center justify-between px-6 md:px-12">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <button
            aria-label="Scroll left"
            onClick={() => scroll("left")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <IconArrowNarrowLeft className="h-4 w-4" />
          </button>
          <button
            aria-label="Scroll right"
            onClick={() => scroll("right")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <IconArrowNarrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Carousel Track */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth px-6 md:px-12 py-2 [scrollbar-width:none] overscroll-x-auto no-scrollbar"
      >
        {videos.map((video) => {
          const channelLink = video.channelId
            ? video.channelId.startsWith("UC")
              ? `https://www.youtube.com/channel/${video.channelId}`
              : `https://www.youtube.com/${video.channelId}`
            : null;

          return (
            <Link
              key={video.id}
              href={`/plus/watch/${video.id}`}
              className="group relative flex-shrink-0 w-64 sm:w-72 md:w-80 overflow-hidden rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition duration-300 flex flex-col"
            >
              {/* Aspect ratio 16:9 thumbnail */}
              <div className="relative aspect-video w-full overflow-hidden bg-neutral-950">
                <img
                  src={video.thumbnailUrl}
                  alt={video.title}
                  className="h-full w-full object-cover group-hover:scale-105 transition duration-500"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent opacity-80" />

                {/* Play icon overlay on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-200">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-black shadow-lg backdrop-blur-sm">
                    <IconPlayerPlay className="h-6 w-6 fill-current" />
                  </div>
                </div>

                {/* LIVE badge only */}
                {video.isLive && (
                  <div className="absolute top-2.5 left-2.5 z-10">
                    <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      LIVE
                    </span>
                  </div>
                )}
              </div>

              {/* Video metadata with Channel Avatar */}
              <div className="p-3.5 flex items-start gap-2.5">
                {video.channelLogoUrl ? (
                  <a
                    href={channelLink || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={video.channelTitle || "YouTube Channel"}
                    className="h-6 w-6 rounded-full overflow-hidden shrink-0 border border-neutral-700 bg-neutral-800 mt-0.5 hover:ring-2 hover:ring-brand transition"
                  >
                    <img
                      src={video.channelLogoUrl}
                      alt={video.channelTitle || "Channel"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                ) : (
                  <div
                    title={video.channelTitle || "Channel"}
                    className="h-6 w-6 rounded-full bg-neutral-800 text-neutral-400 text-[10px] font-bold flex items-center justify-center shrink-0 border border-neutral-700 mt-0.5"
                  >
                    {(video.channelTitle || "F").slice(0, 1).toUpperCase()}
                  </div>
                )}

                <h3 className="text-xs sm:text-sm font-bold text-neutral-200 group-hover:text-white line-clamp-2 transition-colors leading-snug">
                  {video.title}
                </h3>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
