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
} from "@tabler/icons-react";
import { Button, LiveLabel } from "@/components/ftn/ui";
import { FtnLogo } from "@/components/ftn/nav";
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
  twitchVodId,
  broadcastEnded = false,
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
  /** A finished Twitch broadcast: plays its recording instead of the channel. */
  twitchVodId?: string;
  /** A finished Twitch broadcast; without a recording the video area says so. */
  broadcastEnded?: boolean;
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

  // No reserved scrollbar gutter painted grey beside the video.
  useEffect(() => {
    const html = document.documentElement;
    const prev = { gutter: html.style.scrollbarGutter, bg: html.style.backgroundColor };
    html.style.scrollbarGutter = "auto";
    html.style.backgroundColor = "var(--ftn-bg)";
    return () => {
      html.style.scrollbarGutter = prev.gutter;
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

  // The video fills the whole window; the back button floats over its corner. The details sit below it, one scroll down.
  return (
    <div className="ftn-page-enter min-h-screen bg-ftn-bg text-ftn-text">
      <div className="relative h-svh w-full overflow-hidden bg-black">
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/55 p-1 pr-3 backdrop-blur-md">
          <Link
            href="/plus"
            className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full text-white/85 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            title="Back to FTN+"
            aria-label="Back to FTN+"
          >
            <IconArrowLeft className="h-5 w-5" />
          </Link>
          <Link href="/plus" aria-label="FTN+ home" className="inline-flex items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <FtnLogo theme="dark" className="h-5" />
          </Link>
        </div>
        <div className="h-full w-full">
          {broadcastEnded && !twitchVodId && twitchLogin && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-ftn-surface px-6 text-center">
              <p className="ftn-title text-xl text-ftn-text sm:text-2xl">This broadcast has ended</p>
              <p className="max-w-md text-sm text-ftn-text-2">Twitch no longer has a recording of it. Newer streams from {twitchLogin} are on their Twitch channel.</p>
            </div>
          )}
          {startAt !== null && twitchLogin && twitchParent && !(broadcastEnded && !twitchVodId) && (
            <iframe
              src={`https://player.twitch.tv/?${twitchVodId ? `video=v${encodeURIComponent(twitchVodId)}` : `channel=${encodeURIComponent(twitchLogin)}`}&parent=${encodeURIComponent(twitchParent)}&autoplay=true&muted=false`}
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

      <div className="mx-auto w-full max-w-6xl md:px-6">
        <main className="space-y-5 px-4 pb-24 pt-5 md:px-0">
          <div className="space-y-2">
            {isLive && <LiveLabel className="text-sm" />}
            <h1 className="ftn-display text-2xl text-ftn-text sm:text-3xl">{title}</h1>
            {formattedDate && (
              <p className="text-sm text-ftn-text-3">
                {isLive ? "Started" : "Published"} {formattedDate}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            {channelTitle ? (
              <a
                href={channelLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
              >
                {channelLogoUrl ? (
                  <img src={channelLogoUrl} alt="" className="h-9 w-9 flex-none rounded-full border border-ftn-line-strong object-cover" />
                ) : (
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-ftn-line-strong bg-ftn-surface-2 text-sm font-bold text-ftn-text-2">
                    {channelTitle.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="truncate text-sm font-semibold text-ftn-text group-hover:underline underline-offset-4">{channelTitle}</span>
              </a>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {!(broadcastEnded && !twitchVodId) && (
                <Button onClick={toggleSave} variant={saved ? "primary" : "secondary"} size="sm">
                  {saved ? <IconBookmarkFilled className="h-4 w-4" /> : <IconBookmark className="h-4 w-4" />}
                  {saved ? "Saved" : "Save"}
                </Button>
              )}
              <Button onClick={handleShare} variant="secondary" size="sm">
                {copied ? <IconCheck className="h-4 w-4 text-emerald-400" /> : <IconShare className="h-4 w-4" />}
                {copied ? "Link copied" : "Share"}
              </Button>
              <Button href={sourceHref} external variant="secondary" size="sm">
                <SourceIcon className={twitchLogin ? "h-4 w-4 text-purple-400" : "h-4 w-4 text-red-500"} />
                Watch on {sourceName}
              </Button>
            </div>
          </div>

          {cleanDesc && (
            <p className="max-w-3xl whitespace-pre-line border-t border-ftn-line pt-5 text-sm leading-relaxed text-ftn-text-2 sm:text-base">{cleanDesc}</p>
          )}
        </main>
      </div>
    </div>
  );
}
