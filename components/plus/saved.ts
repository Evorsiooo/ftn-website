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

// ------------------------------------------------------------------------------------- radio replays

/** A saved radio replay, as its card shows it. */
export type SavedReplay = { id: string; title: string; show: string | null; art: string | null; startedAt: number; endedAt: number };

const REPLAYS_KEY = "ftn_saved_replays";

function readReplays(): SavedReplay[] {
  try {
    const list = JSON.parse(localStorage.getItem(REPLAYS_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeReplays(list: SavedReplay[]) {
  try {
    localStorage.setItem(REPLAYS_KEY, JSON.stringify(list));
  } catch {}
}

/** Whether [replay] is saved, and a toggle (the account's list when signed in, else this device's). */
export function useSavedReplay(replay: SavedReplay | null) {
  const id = replay?.id;
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!id) return;
    setSaved(readReplays().some((x) => x.id === id));
    fetch(`/api/plus/saved-replays?replayId=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: any) => d?.signedIn && typeof d.saved === "boolean" && setSaved(d.saved))
      .catch(() => {});
  }, [id]);
  const toggle = useCallback(() => {
    if (!replay) return;
    const next = !saved;
    setSaved(next);
    const rest = readReplays().filter((x) => x.id !== replay.id);
    const { id, title, show, art, startedAt, endedAt } = replay;
    writeReplays(next ? [{ id, title, show, art, startedAt, endedAt }, ...rest] : rest);
    fetch("/api/plus/saved-replays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replayId: replay.id, action: next ? "add" : "remove" }),
    }).catch(() => {});
  }, [replay, saved]);
  return { saved, toggle };
}

/** Every saved replay: the account's list when signed in, else this device's. */
export function useSavedReplays() {
  const [items, setItems] = useState<SavedReplay[] | null>(null);
  useEffect(() => {
    fetch("/api/plus/saved-replays", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: any) => setItems(d?.signedIn && Array.isArray(d.replays) ? d.replays : readReplays()))
      .catch(() => setItems(readReplays()));
  }, []);
  return items;
}
