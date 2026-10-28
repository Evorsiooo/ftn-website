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
  const [about, setAbout] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // null until the resume position is known, so the iframe loads once with the right start time.
  const [startAt, setStartAt] = useState<number | null>(null);

  // The player fills the window exactly: no scroll, and no reserved scrollbar gutter painted grey beside it.
  useEffect(() => {
    const html = document.documentElement;
    const prev = { gutter: html.style.scrollbarGutter, overflow: html.style.overflow, bg: html.style.backgroundColor };
    html.style.scrollbarGutter = "auto";
    html.style.overflow = "hidden";
    html.style.backgroundColor = "#000";
    return () => {
      html.style.scrollbarGutter = prev.gutter;
      html.style.overflow = prev.overflow;
      html.style.backgroundColor = prev.bg;
    };
  }, []);

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

  const cleanDesc =
    description && !description.startsWith("Official high-definition stream broadcast from FTN Media Network")
      ? description.trim()
      : "";
  const sourceName = twitchLogin ? "Twitch" : "YouTube";
  const sourceHref = twitchLogin ? `https://www.twitch.tv/${twitchLogin}` : `https://www.youtube.com/watch?v=${youtubeId}`;
  const SourceIcon = twitchLogin ? IconBrandTwitch : IconBrandYoutube;
  const hasMore = Boolean(cleanDesc);

  // The stage fits a 16:9 frame inside whatever room is left (container units), so the player
  // rescales with the window instead of overflowing it.
  const frameStyle: React.CSSProperties = { width: "min(100cqw, calc(100cqh * 16 / 9))", aspectRatio: "16 / 9" };
  const frameClass = "overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl [@media(max-height:26rem)]:rounded-none [@media(max-height:26rem)]:border-0";

  return (
    <div className="ftn-page-enter relative flex h-screen flex-col overflow-hidden bg-black text-white select-none">
      {/* Blurred backdrop so the letterbox around the frame is part of the design, not a void. */}
      {!twitchLogin && (
        <img
          src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-25 blur-3xl"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />

      {/* Top bar */}
      <header className="relative z-10 flex flex-none items-center gap-3 px-3 pt-3 sm:px-5 sm:pt-4 [@media(max-height:26rem)]:hidden">
        <Link
          href="/plus"
          className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20"
          title="Back to FTN+"
          aria-label="Back to FTN+"
        >
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="ftn-display truncate text-base leading-tight sm:text-xl">{title}</h1>
          {channelTitle && (
            <a
              href={channelLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex max-w-full items-center gap-2 text-xs font-semibold text-white/70 transition hover:text-white"
            >
              {channelLogoUrl ? (
                <img src={channelLogoUrl} alt="" className="h-4 w-4 flex-none rounded-full object-cover" />
              ) : null}
              <span className="truncate">{channelTitle}</span>
            </a>
          )}
        </div>
        {isLive ? <LivePill>Live</LivePill> : null}
      </header>

      {/* Stage: the frame is centred and as large as the space allows */}
      <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-3 sm:p-5 [@media(max-height:26rem)]:p-0">
        <div className="flex h-full w-full items-center justify-center" style={{ containerType: "size" }}>
          <div className={frameClass} style={frameStyle}>
            {startAt !== null && twitchLogin && twitchParent && (
              <iframe
                src={`https://player.twitch.tv/?channel=${encodeURIComponent(twitchLogin)}&parent=${encodeURIComponent(twitchParent)}&autoplay=true&muted=false`}
                title={title}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            )}
            {startAt !== null && !twitchLogin && (
              <iframe
                ref={iframeRef}
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1${startAt > 0 ? `&start=${Math.floor(startAt)}` : ""}`}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full border-0"
              />
            )}
          </div>
        </div>
      </main>

      {/* Action bar: wraps on narrow windows and disappears when the window is too short to spare it */}
      <footer className="relative z-10 flex-none px-3 pb-3 sm:px-5 sm:pb-4 [@media(max-height:26rem)]:hidden">
        {about && hasMore && (
          <div className="mb-3 max-h-[28vh] overflow-y-auto rounded-2xl border border-white/10 bg-black/60 p-4 text-sm leading-relaxed text-white/80 backdrop-blur-md">
            {formattedDate && (
              <p className="ftn-eyebrow mb-2 text-white/50">
                {isLive ? "Broadcast started" : "Published"} {formattedDate}
              </p>
            )}
            <p className="whitespace-pre-line">{cleanDesc}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={toggleSave} variant={saved ? "primary" : "glass"} size="sm">
            {saved ? <IconBookmarkFilled className="h-4 w-4" /> : <IconBookmark className="h-4 w-4" />}
            <span className="[@media(max-width:26rem)]:hidden">{saved ? "Saved" : "Save"}</span>
          </Button>
          <Button onClick={handleShare} variant="glass" size="sm">
            {copied ? <IconCheck className="h-4 w-4 text-emerald-400" /> : <IconShare className="h-4 w-4" />}
            <span className="[@media(max-width:26rem)]:hidden">{copied ? "Link copied" : "Share"}</span>
          </Button>
          <Button href={sourceHref} external variant="glass" size="sm">
            <SourceIcon className={twitchLogin ? "h-4 w-4 text-purple-400" : "h-4 w-4 text-red-500"} />
            <span className="[@media(max-width:26rem)]:hidden">Watch on {sourceName}</span>
          </Button>
          {hasMore && (
            <Button onClick={() => setAbout((v) => !v)} variant="glass" size="sm" className="ml-auto" aria-expanded={about}>
              About
              <IconChevronDown className={`h-4 w-4 transition-transform ${about ? "rotate-180" : ""}`} />
            </Button>
          )}
          {!hasMore && formattedDate && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-white/60">
              <IconCalendar className="h-3.5 w-3.5" />
              {isLive ? "Started" : "Posted"} {formattedDate}
            </span>
          )}
        </div>
      </footer>

      {/* Very short windows (minimised player): keep only a back button over the video */}
      <Link
        href="/plus"
        aria-label="Back to FTN+"
        className="absolute left-2 top-2 z-20 hidden h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md [@media(max-height:26rem)]:inline-flex"
      >
        <IconArrowLeft className="h-4 w-4" />
      </Link>
    </div>
  );
}
