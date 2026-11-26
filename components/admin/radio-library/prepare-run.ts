"use client";
// Prepare (Adrien, 2026-11-25): a song goes on air once it has its mixing analysis (BitChord's analyzer,
// unchanged, several songs at once: radio-engine/src/prepare.ts) and, if it came from a link, its title and
// cover checked in the music catalogue (one search every 3.2 s, alongside). Nothing here starts on its own:
// a run starts from the Prepare button, or carries on after a refresh of the same tab (sessionStorage).
// The server side (reservations, progress any device can read and stop) is lib/radio/prep.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Song } from "./types";
import { catalogPatch, pacedSearch } from "./metadata-check";

export interface PrepSong {
  id: string;
  key: string;
  title: string;
  artist: string;
  album: string | null;
  releaseYear: number | null;
  durationSec: number;
  thumbnail: string | null;
  source: string;
  musicVideo: boolean;
  genre: string | null;
  genreByHand: boolean;
  needsAnalysis: boolean;
  needsTitleCheck: boolean;
}

type AnalyseOutcome = { state: "done"; ms: number } | { state: "missing" } | { state: "failed"; message: string };
interface Preparer {
  readonly workers: number;
  analyse(song: { key: string; title: string; artist: string; musicVideo?: boolean }): Promise<AnalyseOutcome>;
  close(): void;
}
type PrepareModule = { createPreparer(workers?: number): Preparer; defaultWorkers(): number };

let moduleLoad: Promise<PrepareModule> | null = null;
/** The engine's Prepare bundle (public/radio-engine/prepare.js), fetched the first time someone starts. */
export function loadPrepareModule(): Promise<PrepareModule> {
  const url = new URL(`/radio-engine/prepare.js?v=${process.env.RADIO_ENGINE_VERSION ?? ""}`, window.location.origin).href;
  moduleLoad ??= import(/* webpackIgnore: true */ url) as Promise<PrepareModule>;
  moduleLoad.catch(() => (moduleLoad = null));
  return moduleLoad;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for the connection: the browser says it's back and the site answers. */
async function connectionBack(stopped: () => boolean) {
  for (;;) {
    if (stopped()) return;
    await sleep(10_000);
    if (!navigator.onLine) continue;
    try {
      const r = await fetch("/api/radio/time", { cache: "no-store" });
      if (r.ok) return;
    } catch {}
  }
}

export type SongPrepResult = { songId: string; analysed: boolean; titleChecked: boolean; patch: Record<string, unknown> | null; error: "missing" | "failed" | null };

/**
 * One song through both steps. The analysis is retried once after a failure; a network fault waits for the
 * connection and tries again (onWaiting tells the page). Throws only when stopped or when the catalogue keeps
 * refusing (the run then stops, as the old title check did).
 */
async function prepareSong(
  song: PrepSong,
  preparer: Preparer,
  search: ReturnType<typeof pacedSearch>,
  stop: { current: boolean },
  onWaiting: (waiting: boolean) => void,
): Promise<SongPrepResult> {
  const analysis = (async (): Promise<"done" | "missing" | "failed"> => {
    if (!song.needsAnalysis) return "done";
    for (let attempt = 0; ; ) {
      try {
        const out = await preparer.analyse(song);
        if (out.state !== "failed") return out.state;
        if (++attempt >= 2) return "failed";
      } catch {
        // offline or the site unreachable: wait, then the same song again
        onWaiting(true);
        await connectionBack(() => stop.current);
        onWaiting(false);
      }
      if (stop.current) throw new Error("stopped");
    }
  })();
  const title = (async (): Promise<{ checked: boolean; patch: Record<string, unknown> | null }> => {
    // uploads keep what was typed in; songs named by YouTube Music's catalogue are recorded as checked when added
    if (!song.needsTitleCheck) return { checked: false, patch: null };
    if (song.source === "upload") return { checked: true, patch: null };
    let refusals = 0;
    const patch = await catalogPatch(song, search, stop, () => ++refusals <= 3);
    if (stop.current) throw new Error("stopped");
    if (patch) await api(`/api/admin/radio/songs/${song.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    return { checked: true, patch };
  })();
  const [a, t] = await Promise.all([analysis, title]);
  return { songId: song.id, analysed: a === "done" && song.needsAnalysis, titleChecked: t.checked, patch: t.patch, error: a === "done" ? null : a };
}

// ---------------------------------------------------------------------------------------------------------
/**
 * The most songs analysed at once on this PC: every thread but one, at most 12. A browser can't see how much
 * memory is free, so the RAM it says it has (Chrome and Brave give up to 8 GB) also caps it: 1.5 songs a GB.
 */
function maxWorkers(): number {
  const threads = navigator.hardwareConcurrency || 2;
  const gb = (navigator as { deviceMemory?: number }).deviceMemory;
  const byRam = gb ? Math.max(1, Math.floor(gb * 1.5)) : 12;
  return Math.max(1, Math.min(12, threads - 1, byRam));
}

/**
 * Tunes how many songs run at once. Each step is measured over at least a minute and twice as many songs as
 * run at once: faster than the step before (5% or more) adds one; slower (10% or more) takes one back and
 * stops growing. A page that stutters (its timers over 250 ms late) takes one back too.
 */
function tuner(start: number, most: number, set: (n: number) => void) {
  let limit = start;
  let growing = true;
  let stepFrom = Date.now();
  let stepDone = 0;
  let before: number | null = null;
  let lagged = 0;
  let tick = Date.now();
  const watch = setInterval(() => {
    const late = Date.now() - tick - 500;
    tick = Date.now();
    lagged = late > 250 ? lagged + 1 : 0;
    if (lagged >= 3 && limit > 1) {
      lagged = 0;
      growing = false;
      limit -= 1;
      set(limit);
      stepFrom = Date.now();
      stepDone = 0;
    }
  }, 500);
  return {
    finished(now: number) {
      stepDone += 1;
      const span = now - stepFrom;
      if (span < 60_000 || stepDone < limit * 2) return;
      const rate = stepDone / span;
      if (before !== null && rate < before * 0.9 && limit > 1) {
        limit -= 1;
        growing = false;
      } else if (growing && limit < most && (before === null || rate >= before * 1.05)) {
        limit += 1;
      } else if (before !== null && rate < before * 1.05) {
        growing = false;
      }
      before = rate;
      stepFrom = now;
      stepDone = 0;
      set(limit);
    },
    close() {
      clearInterval(watch);
    },
  };
}

// The Library's run: songs claimed from the server a batch at a time, so several PCs share the work.

export interface RunState {
  phase: "idle" | "starting" | "running" | "stopping" | "waiting";
  runId: string | null;
  workers: number;
  total: number;
  done: number;
  failed: number;
  /** Songs per minute, measured over the last 10 minutes of this run (null while measuring). */
  perMin: number | null;
  /** How many songs in progress need a title check (for "Title and cover check (new songs)"). */
  titleChecks: boolean;
  note: string | null;
}

const RUN_KEY = "ftn_radio_prep_run";
const MEASURE_AFTER_MS = 3 * 60_000;
const MEASURE_WINDOW_MS = 10 * 60_000;

type Remembered = { runId: string; total: number; done: number; failed: number };
function remembered(): Remembered | null {
  try {
    return JSON.parse(sessionStorage.getItem(RUN_KEY) || "null");
  } catch {
    return null;
  }
}
function remember(r: Remembered | null) {
  try {
    if (r) sessionStorage.setItem(RUN_KEY, JSON.stringify(r));
    else sessionStorage.removeItem(RUN_KEY);
  } catch {}
}

/** The server answered with an error of its own (5xx: a passing fault, tried again; 4xx: a real refusal). */
class ServerError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function prepApi<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/admin/radio/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new ServerError(out?.error || `Request failed (${res.status})`, res.status);
  return out as T;
}

/** Retries a server call through connection drops and passing server faults (the run pauses meanwhile). */
async function steady<T>(call: () => Promise<T>, stopped: () => boolean, onWaiting: (w: boolean) => void): Promise<T> {
  for (;;) {
    try {
      return await call();
    } catch (err) {
      // the server's own refusal (4xx) isn't a connection problem
      if (!(err instanceof TypeError) && !(err instanceof ServerError && err.status >= 500)) throw err;
      onWaiting(true);
      await connectionBack(stopped);
      onWaiting(false);
      if (stopped()) throw new Error("stopped");
    }
  }
}

export function usePrepareRun(onSongDone: (r: SongPrepResult) => void) {
  const [state, setState] = useState<RunState>({ phase: "idle", runId: null, workers: 0, total: 0, done: 0, failed: 0, perMin: null, titleChecks: false, note: null });
  const stop = useRef({ current: false });
  const running = useRef(false);
  const doneCb = useRef(onSongDone);
  doneCb.current = onSongDone;

  const run = useCallback(async (total: number, carried?: Remembered) => {
    if (running.current) return;
    running.current = true;
    const halt = { current: false };
    stop.current = halt;
    const stopped = () => halt.current;
    const waiting = (w: boolean) => setState((s) => ({ ...s, phase: w ? "waiting" : s.phase === "waiting" ? "running" : s.phase }));
    setState((s) => ({ ...s, phase: "starting", note: null, total, done: carried?.done ?? 0, failed: carried?.failed ?? 0, perMin: null }));
    let preparer: Preparer | null = null;
    let runId: string | null = null;
    let done = carried?.done ?? 0;
    let failed = carried?.failed ?? 0;
    const finishedAt: number[] = [];
    const started = Date.now();
    const unload = () => {
      if (runId) navigator.sendBeacon?.("/api/admin/radio/prepare", new Blob([JSON.stringify({ op: "end", runId })], { type: "application/json" }));
    };
    try {
      const mod = await loadPrepareModule();
      // Adaptive (Adrien, 2026-11-26): start at half the PC's threads, then add one song at a time while
      // songs keep finishing faster and the page stays responsive; one back when it gets slower.
      const most = maxWorkers();
      const workers = Math.max(1, Math.min(most, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
      let limit = workers;
      // a refreshed tab carries on: the old run is closed (its songs given back) and this one continues its count
      if (carried) await prepApi({ op: "end", runId: carried.runId }).catch(() => {});
      const startRes = await steady(() => prepApi<{ id: string }>({ op: "start", workers, total, done, failed }), stopped, waiting);
      runId = startRes.id;
      const id = runId;
      remember({ runId: id, total, done, failed });
      window.addEventListener("pagehide", unload);
      // as many analyzers as the most it may grow to: each one's Web Worker only starts when it gets a song
      preparer = mod.createPreparer(most);
      const tune = tuner(limit, most, (n) => {
        limit = n;
        setState((s) => ({ ...s, workers: n }));
      });
      const search = pacedSearch(halt);
      setState((s) => ({ ...s, phase: "running", runId: id, workers }));

      const queue: PrepSong[] = [];
      const inFlight = new Set<Promise<void>>();
      let exhausted = false;
      let lastReport = Date.now();
      const beat = setInterval(() => {
        if (Date.now() - lastReport > 60_000) prepApi<{ stop: boolean }>({ op: "beat", runId: id }).then((r) => r.stop && (halt.current = true)).catch(() => {});
      }, 30_000);
      try {
        while (!halt.current) {
          // keep a few songs in hand beyond those running, so a free analyzer never waits for the server
          if (!exhausted && queue.length < limit) {
            const got = await steady(() => prepApi<{ songs: PrepSong[]; stop: boolean }>({ op: "claim", runId: id, n: limit * 2 - queue.length }), stopped, waiting);
            if (got.stop) break;
            if (!got.songs.length) exhausted = true;
            queue.push(...got.songs);
          }
          while (queue.length && inFlight.size < limit && !halt.current) {
            const song = queue.shift()!;
            setState((s) => ({ ...s, titleChecks: s.titleChecks || song.needsTitleCheck }));
            const p = prepareSong(song, preparer, search, halt, waiting)
              .then(async (r) => {
                if (halt.current) return;
                if (r.error) failed++;
                else done++;
                const now = Date.now();
                finishedAt.push(now);
                tune.finished(now);
                while (finishedAt.length && finishedAt[0]! < now - MEASURE_WINDOW_MS) finishedAt.shift();
                const span = Math.min(MEASURE_WINDOW_MS, now - started);
                const perMin = now - started >= MEASURE_AFTER_MS && finishedAt.length >= 3 ? (finishedAt.length / span) * 60_000 : null;
                setState((s) => ({ ...s, done, failed, perMin }));
                remember({ runId: id, total, done, failed });
                doneCb.current(r);
                const res = await steady(
                  () => prepApi<{ stop: boolean }>({ op: "done", runId: id, songId: r.songId, titleChecked: r.titleChecked, error: r.error, perMin }),
                  stopped,
                  waiting,
                );
                lastReport = Date.now();
                if (res.stop) halt.current = true;
              })
              .catch((err) => {
                if (!halt.current) {
                  halt.current = true;
                  setState((s) => ({ ...s, note: `Stopped: ${err?.message || "something failed"}. Try again later.` }));
                }
              })
              .finally(() => inFlight.delete(p));
            inFlight.add(p);
          }
          if (exhausted && !queue.length && !inFlight.size) break;
          // wait for a song to finish (or a second, to top up the queue)
          await Promise.race([...inFlight, sleep(1000)]);
        }
      } finally {
        clearInterval(beat);
        tune.close();
      }
      setState((s) => ({ ...s, phase: "stopping" }));
      await prepApi({ op: "end", runId: id }).catch(() => {});
      remember(null);
    } catch (err: any) {
      if (runId) await prepApi({ op: "end", runId }).catch(() => {});
      remember(null);
      if (!halt.current) setState((s) => ({ ...s, note: `Couldn't run Prepare: ${err?.message || "it failed to start"}.` }));
    } finally {
      window.removeEventListener("pagehide", unload);
      preparer?.close();
      running.current = false;
      setState((s) => ({ ...s, phase: "idle", runId: null, titleChecks: false }));
    }
  }, []);

  // A refresh of the tab that was preparing carries on (only that tab: sessionStorage). Not a new tab.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const r = remembered();
    if (r) void run(r.total, r);
  }, [run]);

  useEffect(() => () => void (stop.current.current = true), []);

  return {
    state,
    start: (total: number) => void run(total),
    stop: () => {
      stop.current.current = true;
      remember(null);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------
// The Studio: a broadcaster's own queued songs, prepared in their tab as soon as they've downloaded.

export type StudioPrep = Record<string, "preparing" | "ready" | "waiting" | "elsewhere">;

/**
 * [keys]: the downloaded songs of the show's queue; [mine]: those this broadcaster queued. Asks the server which
 * still need preparing (one small read when the list changes) and prepares this broadcaster's here, a few at
 * once. Each key's state: "ready" (on air), "preparing" (in this tab), "elsewhere" (in the tab of the
 * broadcaster who queued it), "waiting" (couldn't be prepared: it plays with a plain crossfade).
 */
export function useStudioPrepare(keys: string[], mine: string[]): StudioPrep {
  const [prep, setPrep] = useState<StudioPrep>({});
  const preparer = useRef<Preparer | null>(null);
  const search = useRef<ReturnType<typeof pacedSearch> | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const halt = useRef({ current: false });
  const sig = [...new Set(keys)].sort().join("\n");
  const mineRef = useRef(mine);
  mineRef.current = mine;

  useEffect(() => {
    const fresh = sig ? sig.split("\n").filter((k) => !seen.current.has(k)) : [];
    if (!fresh.length) return;
    fresh.forEach((k) => seen.current.add(k));
    let cancelled = false;
    (async () => {
      let { songs } = await prepApi<{ songs: PrepSong[] }>({ op: "studio", keys: fresh }).catch(() => ({ songs: [] as PrepSong[] }));
      if (cancelled) return;
      const need = new Set(songs.map((s) => s.key));
      const own = new Set(mineRef.current);
      setPrep((p) => ({ ...p, ...Object.fromEntries(fresh.map((k) => [k, !need.has(k) ? "ready" : own.has(k) ? "preparing" : "elsewhere"])) }));
      songs = songs.filter((s) => own.has(s.key));
      if (!songs.length) return;
      const mod = await loadPrepareModule();
      // a broadcaster's few songs: up to 3 at once leaves the PC free for the show itself
      preparer.current ??= mod.createPreparer(Math.min(3, mod.defaultWorkers()));
      search.current ??= pacedSearch(halt.current);
      await Promise.all(
        songs.map(async (song) => {
          try {
            const r = await prepareSong(song, preparer.current!, search.current!, halt.current, () => {});
            await prepApi({ op: "done", songId: r.songId, titleChecked: r.titleChecked, error: r.error });
            setPrep((p) => ({ ...p, [song.key]: r.error ? "waiting" : "ready" }));
          } catch {
            setPrep((p) => ({ ...p, [song.key]: "waiting" }));
          }
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [sig]);

  // songs another broadcaster's tab is preparing: looked at again once a minute until they're ready
  const elsewhere = Object.entries(prep).filter(([, v]) => v === "elsewhere").map(([k]) => k).sort().join("\n");
  useEffect(() => {
    if (!elsewhere) return;
    const t = setInterval(async () => {
      const keys = elsewhere.split("\n");
      const r = await prepApi<{ songs: PrepSong[] }>({ op: "studio", keys }).catch(() => null);
      if (!r) return;
      const need = new Set(r.songs.map((s) => s.key));
      setPrep((p) => ({ ...p, ...Object.fromEntries(keys.filter((k) => !need.has(k)).map((k) => [k, "ready" as const])) }));
    }, 60_000);
    return () => clearInterval(t);
  }, [elsewhere]);

  useEffect(
    () => () => {
      halt.current.current = true;
      preparer.current?.close();
    },
    [],
  );
  return prep;
}

/** A song's state in the Library (On air, Getting ready, or set aside). */
export { songStatus } from "@/lib/radio/song-status";
