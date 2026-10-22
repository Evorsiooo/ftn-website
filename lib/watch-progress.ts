"use client";
import { useEffect, useState } from "react";

// Continue watching. Positions live in localStorage for everyone; signed-in viewers also sync
// to /api/plus/progress so progress follows them between devices.

const KEY = "ftn_progress";
const MAX_ITEMS = 30;
export const MIN_SECONDS = 10;
export const DONE_RATIO = 0.95;

export interface ProgressItem {
  youtubeId: string;
  position: number;
  duration: number;
  updatedAt: number;
  title: string;
  thumbnailUrl: string;
  channelId?: string;
  channelTitle?: string;
  channelLogoUrl?: string;
}

export function isResumable(p: { position: number; duration: number }) {
  return p.duration > 0 && p.position >= MIN_SECONDS && p.position / p.duration < DONE_RATIO;
}

export function readLocalProgress(): ProgressItem[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeLocalProgress(item: ProgressItem) {
  try {
    const rest = readLocalProgress().filter((p) => p.youtubeId !== item.youtubeId);
    const next = isResumable(item) ? [item, ...rest] : rest;
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX_ITEMS)));
  } catch {}
}

export async function fetchServerProgress(): Promise<ProgressItem[]> {
  try {
    const res = await fetch("/api/plus/progress");
    const data = (await res.json()) as any;
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    return [];
  }
}

export function pushServerProgress(youtubeId: string, position: number, duration: number) {
  fetch("/api/plus/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ youtubeId, position, duration }),
  }).catch(() => {});
}

/** Local and server progress merged, newest first, unfinished only. */
export function useContinueWatching(limit = 8) {
  const [items, setItems] = useState<ProgressItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    const local = readLocalProgress();
    setItems(local.filter(isResumable).slice(0, limit));
    fetchServerProgress().then((server) => {
      if (cancelled || server.length === 0) return;
      const byId = new Map<string, ProgressItem>();
      [...local, ...server].forEach((p) => {
        const cur = byId.get(p.youtubeId);
        if (!cur || p.updatedAt > cur.updatedAt) byId.set(p.youtubeId, p);
      });
      setItems(
        Array.from(byId.values())
          .filter(isResumable)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, limit)
      );
    });
    return () => {
      cancelled = true;
    };
  }, [limit]);
  return items;
}
