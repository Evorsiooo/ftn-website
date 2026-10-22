"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  IconArrowLeft,
  IconBookmark,
  IconBookmarkFilled,
  IconBrandYoutube,
  IconShare,
  IconCheck,
  IconChevronDown,
  IconCalendar,
} from "@tabler/icons-react";

export function OTTPlayer({
  youtubeId: rawYoutubeId,
  title = "FTN Special Broadcast Stream",
  description = "",
  category,
  channelId,
  channelTitle,
  channelLogoUrl,
  publishedAt,
  isLive = false,
}: {
  youtubeId: string;
  title?: string;
  description?: string;
  category?: string;
  channelId?: string;
  channelTitle?: string;
  channelLogoUrl?: string;
  publishedAt?: string | Date;
  isLive?: boolean;
}) {
  const youtubeId = (rawYoutubeId || "").replace(/[^a-zA-Z0-9_\-]/g, "");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Record view analytics for 7-day trending
    if (youtubeId) {
      fetch("/api/plus/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeId }),
      }).catch(() => {});

      // 1. Initial fast check from localStorage
      try {
        const stored = localStorage.getItem("ftn_watchlist");
        if (stored) {
          const list = JSON.parse(stored);
          if (list.some((item: any) => item.id === youtubeId || item.youtubeId === youtubeId)) {
            setSaved(true);
          }
        }
      } catch (e) {
        console.error(e);
      }

      // 2. Authoritative check from database (if authenticated)
      fetch(`/api/plus/watchlist?videoId=${encodeURIComponent(youtubeId)}`)
        .then((res) => res.json())
        .then((data: any) => {
          if (typeof data?.inWatchlist === "boolean") {
            setSaved(data.inWatchlist);
            // Sync localStorage with DB state
            try {
              const stored = localStorage.getItem("ftn_watchlist");
              let list = stored ? JSON.parse(stored) : [];
              if (data.inWatchlist) {
                if (!list.find((item: any) => item.id === youtubeId || item.youtubeId === youtubeId)) {
                  list.push({
                    id: youtubeId,
                    youtubeId: youtubeId,
                    title,
                    description,
                    thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
                    category: category || channelTitle || "FTN+",
                    channelId,
                    channelTitle,
                    channelLogoUrl,
                    publishedAt,
                    isLive,
                  });
                  localStorage.setItem("ftn_watchlist", JSON.stringify(list));
                }
              } else {
                list = list.filter((item: any) => item.id !== youtubeId && item.youtubeId !== youtubeId);
                localStorage.setItem("ftn_watchlist", JSON.stringify(list));
              }
            } catch {}
          }
        })
        .catch(() => {});
    }
  }, [youtubeId]);

  const toggleSave = () => {
    const nextState = !saved;
    setSaved(nextState);

    const videoItem = {
      id: youtubeId,
      youtubeId: youtubeId,
      title,
      description,
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
      category: category || channelTitle || "FTN+",
      channelId,
      channelTitle,
      channelLogoUrl,
      publishedAt,
      isLive,
    };

    try {
      const stored = localStorage.getItem("ftn_watchlist");
      let list = stored ? JSON.parse(stored) : [];
      if (nextState) {
        if (!list.find((item: any) => item.id === youtubeId || item.youtubeId === youtubeId)) {
          list.push(videoItem);
        }
      } else {
        list = list.filter((item: any) => item.id !== youtubeId && item.youtubeId !== youtubeId);
      }
      localStorage.setItem("ftn_watchlist", JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }

    // Sync to backend watchlist API with explicit action
    fetch("/api/plus/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: youtubeId, action: nextState ? "add" : "remove" }),
    })
      .then((res) => res.json())
      .then((data: any) => {
        if (typeof data?.saved === "boolean") {
          setSaved(data.saved);
        }
      })
      .catch(() => {});
  };

  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const channelLink = channelId
    ? channelId.startsWith("UC")
      ? `https://www.youtube.com/channel/${channelId}`
      : `https://www.youtube.com/${channelId}`
    : `https://www.youtube.com/watch?v=${youtubeId}`;

  const formattedDate = publishedAt
    ? new Date(publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-black text-white select-none">
      {/* 1. INITIAL FULL SCREEN VIEWPORT */}
      <div className="relative w-full h-screen bg-black overflow-hidden">
        {/* Full-bleed YouTube Embed */}
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="w-full h-full border-0 absolute inset-0 z-0"
        />

        {/* Top Header Overlay: Back button positioned with isolated footprint */}
        <div className="absolute top-6 left-6 sm:top-8 sm:left-8 z-20 pointer-events-auto">
          <Link
            href="/plus"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/70 backdrop-blur-md border border-neutral-800 text-white hover:bg-neutral-800 transition shadow-lg cursor-pointer"
            title="Back to FTN+ Browse"
          >
            <IconArrowLeft className="h-5 w-5" />
          </Link>
        </div>

        {/* Bottom Static Indicator Arrow */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="flex flex-col items-center gap-1 text-neutral-400 bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
            <IconChevronDown className="h-4 w-4 text-white" />
          </div>
        </div>
      </div>

      {/* 2. SCROLL DOWN DETAILS SECTION */}
      <div className="max-w-4xl mx-auto px-6 sm:px-10 py-12 space-y-6">
        <div className="space-y-3">
          {/* Live chip / Category indicator */}
          <div className="flex flex-wrap items-center gap-2">
            {isLive ? (
              <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                LIVE
              </span>
            ) : null}

            {formattedDate && (
              <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400 font-medium">
                <IconCalendar className="h-3.5 w-3.5 text-neutral-500" />
                {isLive ? "Started" : "Posted"} {formattedDate}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            {title}
          </h1>

          {/* Channel Info Bar */}
          {channelTitle && (
            <div className="flex items-center gap-3 pt-1">
              <a
                href={channelLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 group"
              >
                {channelLogoUrl ? (
                  <img
                    src={channelLogoUrl}
                    alt={channelTitle}
                    className="h-8 w-8 rounded-full object-cover border border-neutral-700 group-hover:ring-2 group-hover:ring-brand transition"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-neutral-800 border border-neutral-700 text-xs font-bold text-neutral-300 flex items-center justify-center">
                    {channelTitle.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-bold text-neutral-200 group-hover:text-white transition underline-offset-4 group-hover:underline">
                  {channelTitle}
                </span>
              </a>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Save to Watchlist Button */}
          <button
            onClick={toggleSave}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold border transition cursor-pointer ${
              saved
                ? "bg-brand border-brand text-black font-bold shadow-[0px_2px_0px_0px_#FFFFFF40_inset]"
                : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800"
            }`}
          >
            {saved ? (
              <>
                <IconBookmarkFilled className="h-4 w-4 text-black" />
                Saved
              </>
            ) : (
              <>
                <IconBookmark className="h-4 w-4" />
                Save to Watchlist
              </>
            )}
          </button>

          {/* Go to YouTube Button */}
          <a
            href={`https://www.youtube.com/watch?v=${youtubeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
          >
            <IconBrandYoutube className="h-4 w-4 text-red-500" />
            Watch on YouTube
          </a>

          {/* Share Button */}
          <button
            onClick={handleShare}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            {copied ? (
              <>
                <IconCheck className="h-4 w-4 text-emerald-400" />
                Link Copied!
              </>
            ) : (
              <>
                <IconShare className="h-4 w-4" />
                Share
              </>
            )}
          </button>
        </div>

        {/* Description Structured Text */}
        {(() => {
          const cleanDesc =
            description &&
            !description.startsWith("Official high-definition stream broadcast from FTN Media Network")
              ? description.trim()
              : "";
          if (!formattedDate && !cleanDesc) return null;
          return (
            <div className="pt-4 border-t border-neutral-850 space-y-2">
              {formattedDate && (
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  {isLive ? "Broadcast Started" : "Published"}: {formattedDate}
                </p>
              )}
              {cleanDesc ? (
                <p className="text-sm sm:text-base text-neutral-300 leading-relaxed whitespace-pre-line">
                  {cleanDesc}
                </p>
              ) : null}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
