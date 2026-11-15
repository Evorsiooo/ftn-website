"use client";
// Saved (watch later). Kept on this device for everyone; signed-in members also keep it on their account
// (/api/plus/watchlist), as before the redesign.
import { useCallback, useEffect, useState } from "react";
import type { PlusVideo } from "./cards";

const KEY = "ftn_watchlist";

type Stored = { id: string; youtubeId: string; title: string; thumbnailUrl: string; channelId?: string; channelTitle?: string; channelLogoUrl?: string | null; publishedAt?: string; isLive?: boolean; description?: string };

function readLocal(): Stored[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLocal(list: Stored[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

const toStored = (v: PlusVideo): Stored => ({
  id: v.id,
  youtubeId: v.id,
  title: v.title,
  thumbnailUrl: v.thumb,
  channelId: v.channelId,
  channelTitle: v.channel,
  channelLogoUrl: v.logo,
  publishedAt: v.publishedAt,
  isLive: v.live,
  description: v.description,
});

/** Whether [video] is saved, and a toggle. */
export function useSaved(video: PlusVideo | null) {
  const id = video?.id;
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!id) return;
    setSaved(readLocal().some((x) => x.id === id || x.youtubeId === id));
    fetch(`/api/plus/watchlist?videoId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d: any) => typeof d?.inWatchlist === "boolean" && setSaved(d.inWatchlist))
      .catch(() => {});
  }, [id]);
  const toggle = useCallback(() => {
    if (!video) return;
    const next = !saved;
    setSaved(next);
    const rest = readLocal().filter((x) => x.id !== video.id && x.youtubeId !== video.id);
    writeLocal(next ? [toStored(video), ...rest] : rest);
    fetch("/api/plus/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId: video.id, action: next ? "add" : "remove" }),
    })
      .then((r) => r.json())
      .then((d: any) => typeof d?.saved === "boolean" && setSaved(d.saved))
      .catch(() => {});
  }, [video, saved]);
  return { saved, toggle };
}

/** Everything saved: the account's list when signed in, else this device's. Rows as the watchlist API gives them. */
export function useSavedList() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => {
    fetch("/api/plus/watchlist")
      .then((r) => r.json())
      .then((d: any) => setItems(Array.isArray(d?.watchlist) && d.watchlist.length ? d.watchlist : readLocal()))
      .catch(() => setItems(readLocal()));
  }, []);
  return items;
}
