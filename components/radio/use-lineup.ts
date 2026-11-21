"use client";
// The songs lined up in the AutoDJ's running order, for the Studio: the one on air and those after it
// (already mixed). Read from the bucket's public domain like the listeners do, so polling it costs the
// website nothing.
import { useCallback, useEffect, useState } from "react";
import { endOfTimelineMs, slotAt, slotIndexAt, type LibrarySong, type RadioTimeline } from "@/lib/radio/autodj";
import { RADIO_FILES } from "./use-radio-source";
import { loadLibrary, serverOffset } from "./use-on-air";

export type LinedUp = { k: number; key: string; title: string; artist: string; art: string | null; startMs: number; endMs: number };

const POLL_MS = 5_000;

export function useLineup(enabled: boolean): { onAir: LinedUp | null; next: LinedUp[]; serverNow: () => number; reload: () => void } {
  const [tl, setTl] = useState<RadioTimeline | null>(null);
  const [songs, setSongs] = useState<LibrarySong[]>([]);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const read = useCallback(() => {
    fetch(`${RADIO_FILES}/radio/autodj.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<RadioTimeline>) : null))
      .then((t) => setTl((old) => (t && (!old || t.rev >= old.rev) ? t : old)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void loadLibrary().then(setSongs);
    void serverOffset().then(setSkew);
    read();
    const poll = setInterval(read, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [enabled, read]);

  const serverNow = now + skew;
  let onAir: LinedUp | null = null;
  const next: LinedUp[] = [];
  if (tl && endOfTimelineMs(tl) > serverNow) {
    const k = slotIndexAt(tl, serverNow);
    if (k !== null) {
      for (let kk = k; kk < tl.firstK + tl.items.length; kk++) {
        const slot = slotAt(tl, kk);
        if (!slot) break;
        const it = slot.item;
        const row = { k: kk, key: it.key, title: it.title, artist: it.artist, art: songs.find((s) => s.key === it.key)?.thumbnail ?? null, startMs: slot.startMs, endMs: slot.endMs };
        if (kk === k) onAir = row;
        else next.push(row);
      }
    }
  }
  return { onAir, next, serverNow: () => Date.now() + skew, reload: read };
}
