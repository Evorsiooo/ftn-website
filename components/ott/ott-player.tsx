"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  IconArrowLeft,
  IconBookmark,
  IconBookmarkFilled,
  IconBrandTwitch,
  IconBrandYoutube,
  IconShare,
  IconCheck,
  IconChevronDown,
  IconCalendar,
} from "@tabler/icons-react";
import { Button, LivePill } from "@/components/ftn/ui";
import { isTwitchId, twitchLoginFromId } from "@/lib/twitch-id";
import {
  fetchServerProgress,
  isResumable,
  pushServerProgress,
  readLocalProgress,
  writeLocalProgress,
} from "@/lib/watch-progress";

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
  const twitchLogin = isTwitchId(youtubeId) ? twitchLoginFromId(youtubeId) : null;
  // Twitch refuses to embed unless it is told which domain the player runs on.
  const [twitchParent, setTwitchParent] = useState<string | null>(null);
  useEffect(() => {
    setTwitchParent(window.location.hostname);
  }, []);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // null until the resume position is known, so the iframe loads once with the right start time.
  const [startAt, setStartAt] = useState<number | null>(null);

  // Resume position: the newest of this device's and the server's record.
  useEffect(() => {
    if (!youtubeId) return;
    if (isLive || twitchLogin) {
      setStartAt(0);
      return;
    }
    let done = false;
    const finish = (seconds: number) => {
      if (done) return;
      done = true;
      setStartAt(seconds);
    };
    const local = readLocalProgress().find((p) => p.youtubeId === youtubeId);
    const timer = setTimeout(() => finish(local && isResumable(local) ? local.position : 0), 1200);
    fetchServerProgress().then((server) => {
      const remote = server.find((p) => p.youtubeId === youtubeId);
      const best = [local, remote].filter(Boolean).sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];
      clearTimeout(timer);
      finish(best && isResumable(best) ? best.position : 0);
    });
    return () => clearTimeout(timer);
  }, [youtubeId, isLive, twitchLogin]);

  // Record watch position from the embedded player (YouTube iframe postMessage API).
  useEffect(() => {
    if (!youtubeId || isLive || startAt === null) return;
    const frame = iframeRef.current;
    if (!frame) return;
    let position = 0;
    let duration = 0;
    let lastLocal = 0;
    let lastServer = 0;
    const save = (force?: boolean) => {
      if (!duration || position < 1) return;
      const now = Date.now();
      if (force || now - lastLocal > 5000) {
        lastLocal = now;
        writeLocalProgress({
          youtubeId,
          position,
          duration,
          updatedAt: now,
          title,
          thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
          channelId,
          channelTitle,
          channelLogoUrl,
        });
      }
      if (force || now - lastServer > 20000) {
        lastServer = now;
        pushServerProgress(youtubeId, position, duration);
      }
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || typeof e.data !== "string") return;
      try {
        const msg = JSON.parse(e.data);
        const info = msg?.info;
        if (msg?.event === "infoDelivery" && info) {
          if (typeof info.currentTime === "number") position = info.currentTime;
          if (typeof info.duration === "number" && info.duration > 0) duration = info.duration;
          save();
        }
      } catch {}
    };
    const listen = () =>
      frame.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "ftn-player", channel: "widget" }), "*");
    frame.addEventListener("load", listen);
    window.addEventListener("message", onMessage);
    const onHide = () => save(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      frame.removeEventListener("load", listen);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", onHide);
      save(true);
    };
  }, [youtubeId, isLive, startAt, title, channelId, channelTitle, channelLogoUrl]);

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

  const channelLink = twitchLogin
    ? `https://www.twitch.tv/${twitchLogin}`
    : channelId
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
    <div className="ftn-page-enter min-h-screen bg-ftn-bg text-ftn-text select-none">
      {/* 1. INITIAL FULL SCREEN VIEWPORT */}
      <div className="relative w-full h-screen bg-ftn-bg overflow-hidden">
        {/* Full-bleed YouTube Embed */}
        {startAt !== null && twitchLogin && twitchParent && (
        <iframe
          src={`https://player.twitch.tv/?channel=${encodeURIComponent(twitchLogin)}&parent=${encodeURIComponent(twitchParent)}&autoplay=true&muted=false`}
          title={title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="w-full h-full border-0 absolute inset-0 z-0"
        />
        )}
        {startAt !== null && !twitchLogin && (
        <iframe
          ref={iframeRef}
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1${startAt > 0 ? `&start=${Math.floor(startAt)}` : ""}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="w-full h-full border-0 absolute inset-0 z-0"
        />
        )}

        {/* Top Header Overlay: Back button positioned with isolated footprint */}
        <div className="absolute top-6 left-6 sm:top-8 sm:left-8 z-20 pointer-events-auto">
          <Link
            href="/plus"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/70 backdrop-blur-md border border-ftn-line-strong text-white hover:bg-black/90 transition shadow-lg cursor-pointer"
            title="Back to FTN+ Browse"
          >
            <IconArrowLeft className="h-5 w-5" />
          </Link>
        </div>

        {/* Bottom Static Indicator Arrow */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="flex flex-col items-center gap-1 text-ftn-text-3 bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
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
              <LivePill>Live</LivePill>
            ) : null}

            {formattedDate && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ftn-text-3 font-medium">
                <IconCalendar className="h-3.5 w-3.5" />
                {isLive ? "Started" : "Posted"} {formattedDate}
              </span>
            )}
          </div>

          <h1 className="ftn-display text-3xl sm:text-5xl text-ftn-text leading-[1.05]">
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
                    className="h-8 w-8 rounded-full object-cover border border-ftn-line-strong group-hover:ring-2 group-hover:ring-brand transition"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-ftn-surface-2 border border-ftn-line-strong text-xs font-bold text-ftn-text-2 flex items-center justify-center">
                    {channelTitle.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-semibold text-ftn-text-2 group-hover:text-ftn-text transition underline-offset-4 group-hover:underline">
                  {channelTitle}
                </span>
              </a>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={toggleSave} variant={saved ? "primary" : "secondary"}>
            {saved ? <IconBookmarkFilled className="h-4 w-4" /> : <IconBookmark className="h-4 w-4" />}
            {saved ? "Saved" : "Save to watchlist"}
          </Button>

          <Button href={twitchLogin ? `https://www.twitch.tv/${twitchLogin}` : `https://www.youtube.com/watch?v=${youtubeId}`} external variant="secondary">
            {twitchLogin ? <IconBrandTwitch className="h-4 w-4 text-purple-400" /> : <IconBrandYoutube className="h-4 w-4 text-red-500" />}
            {twitchLogin ? "Watch on Twitch" : "Watch on YouTube"}
          </Button>

          <Button onClick={handleShare} variant="secondary">
            {copied ? <IconCheck className="h-4 w-4 text-emerald-400" /> : <IconShare className="h-4 w-4" />}
            {copied ? "Link copied" : "Share"}
          </Button>
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
            <div className="pt-4 border-t border-ftn-line space-y-2">
              {formattedDate && (
                <p className="ftn-eyebrow text-ftn-text-3">
                  {isLive ? "Broadcast Started" : "Published"}: {formattedDate}
                </p>
              )}
              {cleanDesc ? (
                <p className="text-sm sm:text-base text-ftn-text-2 leading-relaxed whitespace-pre-line">
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
