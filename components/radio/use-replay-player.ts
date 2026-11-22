"use client";
// The replay player. It lives in RadioProvider (the root layout), like the live radio, so a replay
// carries on through every client-side navigation and shows in the player bar.
//
// A replay isn't one recorded file: it is rebuilt in the browser from the running orders that
// played (the same engine and mixes) and each person's recorded voice, so it sounds like the show did.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { endOfTimelineMs, nowPlaying, slotIndexAt, type RadioTimeline } from "@/lib/radio/autodj";
import { RADIO_FILES } from "./use-radio-source";
import { loadStationModule } from "./use-radio-player";
import { TALK_DUCK, TalkDetector } from "./voice";

export type ReplayInfo = { id: string; kind: string; title: string; show: string | null; art: string | null; startedAt: number; endedAt: number };

export type ReplayData = {
  replay: ReplayInfo;
  timelines: string[];
  voices: { key: string; start: number; end: number; userId?: string | null }[];
  /** The people heard on the show, in the order they were first heard. */
  people?: { id: string; name: string; avatar: string | null }[];
  pauses: { start: number; end: number }[];
};

/** A replay with its running orders fetched, ready to play. */
export type LoadedReplay = ReplayData & { tls: RadioTimeline[] };

type ReplayStation = { nowMs(): number; playhead?(): { key: string; sec: number } | null; setVolume(v: number): void; setVoiceDuck(l: number): void; stop(): void; status(): { state: string } };
type ReplayModule = {
  startReplay(o: { timelines: RadioTimeline[]; pauses: { start: number; end: number }[]; fromMs: number; volume?: number }): Promise<ReplayStation>;
};

export const replayFileUrl = (key: string) => `${RADIO_FILES}/${key.split("/").map(encodeURIComponent).join("/")}`;

const cache = new Map<string, Promise<LoadedReplay | "missing">>();
/** A replay and its running orders (kept for the session, so going back to a replay page is instant). */
export function loadReplay(id: string): Promise<LoadedReplay | "missing"> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/api/radio/replays/${encodeURIComponent(id)}`)
      .then((r): Promise<ReplayData | "missing"> => (r.ok ? (r.json() as Promise<ReplayData>) : Promise.resolve("missing")))
      .then(async (d) => {
        if (d === "missing") return d;
        const tls = await Promise.all(d.timelines.map((k) => fetch(replayFileUrl(k)).then((r) => (r.ok ? (r.json() as Promise<RadioTimeline>) : null)).catch(() => null)));
        return { ...d, tls: tls.filter((t): t is RadioTimeline => !!t) };
      });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** The song heard at ms and where it was in it, as the running order that was playing then had it; none while the music was paused. */
export function songInfoAt(d: LoadedReplay, ms: number): { key: string; title: string; artist: string; durationSec: number; positionSec: number } | null {
  if (d.pauses.some((p) => ms >= p.start && ms < p.end)) return null;
  let tl: RadioTimeline | null = null;
  for (const t of d.tls) {
    if (slotIndexAt(t, ms) === null || endOfTimelineMs(t) <= ms) continue;
    if (!tl || t.rev > tl.rev) tl = t;
  }
  const on = tl && nowPlaying(tl, ms);
  if (!on) return null;
  const it = on.slot.item;
  return { key: it.key, title: it.title, artist: it.artist, durationSec: it.durationSec, positionSec: on.positionSec };
}

/** The song heard at ms ("Song · Artist"), as the running order that was playing then had it; none while the music was paused. */
export function songAt(d: LoadedReplay, ms: number): string | null {
  const on = songInfoAt(d, ms);
  return on ? `${on.title} · ${on.artist}` : null;
}

/** A gap shorter than this between two of someone's recorded pieces still counts as them on air. */
const ON_AIR_GAP_MS = 5_000;

export type StagePerson = { id: string; name: string; avatar: string | null; talking: boolean };

/** The people on air at ms (anyone with a recorded piece then), with who is talking. */
export function stageAt(d: ReplayData, ms: number, talking: string[]): StagePerson[] {
  const on = new Set(d.voices.filter((v) => v.userId && ms >= v.start - ON_AIR_GAP_MS && ms < v.end + ON_AIR_GAP_MS).map((v) => v.userId!));
  return (d.people ?? []).filter((p) => on.has(p.id)).map((p) => ({ ...p, talking: talking.includes(p.id) }));
}

export interface ReplayPlayer {
  /** The replay in the player (playing or paused), or null. */
  current: LoadedReplay | null;
  playing: boolean;
  /** Where the current replay is (server ms of the show). */
  at: number;
  /** Who is talking now (user ids). */
  speaking: string[];
  play: (id: string, fromMs: number) => Promise<void>;
  pause: () => void;
  /** Moves the current replay to ms (carries on playing if it was). */
  seek: (ms: number) => void;
  /** Stops and takes the replay out of the player. */
  close: () => void;
  /** The song heard right now and where it is (seconds), read when asked: what the lyrics follow. Null when paused. */
  playheadNow: () => { key: string; sec: number } | null;
}

export function useReplayPlayer({ volume, beforePlay }: { volume: number; beforePlay: () => void }): ReplayPlayer {
  const [current, setCurrent] = useState<LoadedReplay | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [speaking, setSpeaking] = useState<string[]>([]);
  const station = useRef<ReplayStation | null>(null);
  // bumped by every start and stop: a start that finishes after a newer one stops itself, so two
  // replays never play over each other
  const gen = useRef(0);
  const voices = useRef(new Map<string, HTMLAudioElement>());
  const detector = useRef<TalkDetector | null>(null);
  const volRef = useRef(volume);
  volRef.current = volume;
  const beforeRef = useRef(beforePlay);
  beforeRef.current = beforePlay;
  const currentRef = useRef(current);
  currentRef.current = current;

  const halt = useCallback(() => {
    gen.current++;
    station.current?.stop();
    station.current = null;
    for (const el of voices.current.values()) el.pause();
    setPlaying(false);
    setSpeaking([]);
  }, []);

  const play = useCallback(
    async (id: string, fromMs: number) => {
      halt();
      const mine = gen.current;
      const d = await loadReplay(id);
      if (d === "missing" || mine !== gen.current) return;
      if (currentRef.current?.replay.id !== id) {
        // another replay's voices aren't needed any more
        for (const [k, el] of voices.current) {
          el.pause();
          el.removeAttribute("src");
          detector.current?.remove(k);
        }
        voices.current.clear();
      }
      setCurrent(d);
      setAt(fromMs);
      // the live radio stops while a replay plays
      beforeRef.current();
      // the same versioned engine URL as the live radio, so a browser never runs a cached old engine
      const mod = (await loadStationModule()) as unknown as ReplayModule;
      if (mine !== gen.current) return;
      const st = await mod.startReplay({ timelines: d.tls, pauses: d.pauses, fromMs, volume: volRef.current });
      if (mine !== gen.current) return st.stop();
      station.current = st;
      if (!detector.current) detector.current = new TalkDetector((talking) => station.current?.setVoiceDuck(talking ? TALK_DUCK : 1));
      const owner = new Map(d.voices.map((v) => [v.key, v.userId ?? null]));
      detector.current.onSpeakers = (keys) => {
        if (mine !== gen.current) return;
        const ids = [...new Set(keys.map((k) => owner.get(k)).filter((u): u is string => !!u))].sort();
        setSpeaking((was) => (was.join(",") === ids.join(",") ? was : ids));
      };
      setPlaying(true);
    },
    [halt]
  );

  const pause = useCallback(() => {
    const st = station.current;
    if (st) setAt(st.nowMs());
    halt();
  }, [halt]);

  const seek = useCallback(
    (ms: number) => {
      const d = currentRef.current;
      if (!d) return;
      setAt(ms);
      if (station.current) void play(d.replay.id, ms);
    },
    [play]
  );

  const close = useCallback(() => {
    halt();
    setCurrent(null);
  }, [halt]);

  // keep the voices on the replay's clock, and the position up to date
  useEffect(() => {
    if (!playing || !current) return;
    const t = setInterval(() => {
      const st = station.current;
      if (!st) return;
      const now = st.nowMs();
      if (now >= current.replay.endedAt) {
        halt();
        setAt(current.replay.endedAt);
        return;
      }
      setAt(now);
      for (const v of current.voices) {
        const on = now >= v.start && now < v.end;
        let el = voices.current.get(v.key);
        if (!on) {
          if (el && !el.paused) el.pause();
          continue;
        }
        if (!el) {
          el = new Audio();
          el.crossOrigin = "anonymous";
          el.preload = "auto";
          el.src = replayFileUrl(v.key);
          voices.current.set(v.key, el);
          detector.current?.addElement(v.key, el);
        }
        el.volume = volRef.current;
        const want = (now - v.start) / 1000;
        if (Math.abs(el.currentTime - want) > 0.35) el.currentTime = want;
        if (el.paused) void el.play().catch(() => {});
      }
    }, 250);
    return () => clearInterval(t);
  }, [playing, current, halt]);

  useEffect(() => {
    station.current?.setVolume(volume);
    for (const el of voices.current.values()) el.volume = volume;
  }, [volume]);

  useEffect(
    () => () => {
      gen.current++;
      station.current?.stop();
      for (const el of voices.current.values()) el.pause();
      detector.current?.close();
    },
    []
  );

  const playheadNow = useCallback(() => station.current?.playhead?.() ?? null, []);

  return useMemo(() => ({ current, playing, at, speaking, play, pause, seek, close, playheadNow }), [current, playing, at, speaking, play, pause, seek, close, playheadNow]);
}
