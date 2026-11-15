"use client";
// What the radio is playing, for pages that show it without playing it (Home's radio row, the Radio page before
// Listen). While this browser plays the AutoDJ, its own player is the source; otherwise the stored running order
// and the server clock give the same answer every listener hears, and between listeners virtualOnAir does.
import { useEffect, useMemo, useState } from "react";
import { endOfTimelineMs, nowPlaying, virtualOnAir, type LibrarySong, type RadioTimeline } from "@/lib/radio/autodj";
import { RADIO_FILES } from "./use-radio-source";
import { useRadio } from "./radio-provider";

export type OnAir =
  /** Still loading. */
  | { state: "loading" }
  /** No songs in the library: the radio is off air. */
  | { state: "off-air" }
  | {
      state: "song";
      key: string;
      title: string;
      artist: string;
      art: string | null;
      /** Where the song was at [at] (this device's ms); null while this browser plays it (ask the player). */
      positionSec: number | null;
      at: number;
      durationSec: number;
    }
  /** An OBS show on Icecast. */
  | { state: "icecast" };

const POLL_MS = 15_000;

let library: Promise<LibrarySong[]> | null = null;
function loadLibrary() {
  library ??= fetch("/api/radio/library")
    .then((r) => (r.ok ? r.json() : { songs: [] }))
    .then((b: any) => (Array.isArray(b?.songs) ? b.songs : []))
    .catch(() => {
      library = null;
      return [];
    });
  return library;
}

/** Server ms minus this device's ms, from one quick ping (good to ~the round trip, plenty for a display). */
let offset: Promise<number> | null = null;
function serverOffset() {
  offset ??= (async () => {
    const sent = Date.now();
    const r = await fetch(`/api/radio/time?c=${sent}`, { cache: "no-store" });
    const got = Date.now();
    const body = (await r.json()) as { serverMs: number };
    return body.serverMs - (sent + got) / 2;
  })().catch(() => {
    offset = null;
    return 0;
  });
  return offset;
}

export function useOnAir(enabled = true): OnAir {
  const radio = useRadio();
  const playingHere = radio.source === "autodj" && radio.song && radio.localStatus === "playing";
  const [songs, setSongs] = useState<LibrarySong[] | null>(null);
  const [tl, setTl] = useState<RadioTimeline | null | undefined>(undefined);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadLibrary().then((s) => alive && setSongs(s));
    void serverOffset().then((o) => alive && setSkew(o));
    const read = () =>
      fetch(`${RADIO_FILES}/radio/autodj.json?t=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<RadioTimeline>) : null))
        .then((t) => alive && setTl(t))
        .catch(() => alive && setTl(null));
    if (!playingHere) void read();
    const poll = playingHere ? undefined : setInterval(read, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [enabled, playingHere]);

  return useMemo<OnAir>(() => {
    const art = (key: string) => songs?.find((s) => s.key === key)?.thumbnail ?? null;
    if (radio.source === "icecast") return { state: "icecast" };
    if (playingHere && radio.song) {
      const s = radio.song;
      return { state: "song", key: s.key, title: s.title, artist: s.artist, art: art(s.key), positionSec: null, at: now, durationSec: s.durationSec };
    }
    if (songs === null || tl === undefined) return { state: "loading" };
    const serverNow = now + skew;
    if (tl && endOfTimelineMs(tl) > serverNow) {
      const np = nowPlaying(tl, serverNow);
      if (np) {
        const it = np.slot.item;
        return { state: "song", key: it.key, title: it.title, artist: it.artist, art: art(it.key), positionSec: np.positionSec, at: now, durationSec: it.durationSec };
      }
    }
    // Nobody listening: the song the first listener will start with, at the same place (see virtualOnAir).
    const v = virtualOnAir(songs, serverNow);
    if (!v) return { state: "off-air" };
    return { state: "song", key: v.song.key, title: v.song.title, artist: v.song.artist, art: v.song.thumbnail ?? null, positionSec: v.positionSec, at: now, durationSec: v.song.durationSec ?? 0 };
  }, [radio.source, radio.song, playingHere, songs, tl, now, skew]);
}
