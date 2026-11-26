// The radio for the website: what components/radio/radio-provider.tsx loads
// (as /radio-engine/site.js) when a listener presses Listen. Wraps the engine
// the lab proved; the page only sees this small surface.
import { fetchTimeline, loadLibrary } from './radio/autodj';
import { RadioEngine } from './radio/engine';
import type { RadioTimeline, TimelineItem } from './radio/timeline';

export type StationState = 'starting' | 'playing' | 'off-air';

export interface StationStatus {
  state: StationState;
  /** The song on air (R2 key, title, artist, decoded length). */
  song: { key: string; title: string; artist: string; durationSec: number } | null;
  positionSec: number | null;
  /** Listeners on now, as last counted by the website (null: unknown). */
  listeners: number | null;
}

export interface Station {
  status(): StationStatus;
  /** The song heard right now and where it is (seconds), read at the moment of asking: for the lyrics. */
  playhead(): { key: string; sec: number } | null;
  setVolume(volume: number): void;
  setDuck(level: number): void;
  /** Lowers the music while someone on air talks (1 = full). */
  setVoiceDuck(level: number): void;
  stop(): void;
  /** For a listener's problem report: how the engine is doing right now (sync, timing, what's lined up). */
  diagnostics?(): StationDiagnostics;
}

export interface StationDiagnostics {
  offsetMs: number | null;
  roundTripMs: number | null;
  outputLatencyMs: number | null;
  audioState: string | null;
  nextMix: { style: string; inSec: number } | null;
  songsLinedUp: number | null;
  rev: number | null;
  /** The longest gap between two engine ticks (a frozen tab or a busy device). */
  maxFreezeMs: number | null;
  /** Jumps and speed changes the decks made to stay in step, over listeningSec. */
  jumps: number | null;
  speedChanges: number | null;
  listeningSec: number | null;
}

function diagnosticsOf(engine: RadioEngine): StationDiagnostics {
  const s = engine.status as Record<string, any>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    offsetMs: num(s.offsetMs ?? engine.clock.offsetMs),
    roundTripMs: num(s.roundTripMs ?? engine.clock.roundTripMs),
    outputLatencyMs: num(s.outputLatencyMs),
    audioState: typeof s.ctxState === 'string' ? s.ctxState : null,
    nextMix: s.nextMix && typeof s.nextMix.inSec === 'number' ? { style: String(s.nextMix.style ?? ''), inSec: s.nextMix.inSec } : null,
    songsLinedUp: num(s.songsLinedUp),
    rev: num(s.rev),
    maxFreezeMs: num(s.maxTickGapMs),
    jumps: num(s.jumps),
    speedChanges: num(s.speedChanges),
    listeningSec: num(s.listeningSec),
  };
}

export interface StationOptions {
  listenerId?: string;
  volume?: number;
  onSong?: (item: TimelineItem) => void;
  log?: (line: string) => void;
}

/** Call from a click: the browser lets audio start only inside a user gesture. */
export async function startStation(opts: StationOptions = {}): Promise<Station> {
  // iOS 17+: keep playing with the ringer switch on silent and while locked
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
  // A slow or failed library fetch must not stop the radio: the running order is enough to start
  // playing, and the engine fetches the library again until it has it.
  const [library, tl] = await Promise.all([loadLibrary().catch(() => [] as Awaited<ReturnType<typeof loadLibrary>>), fetchTimeline().catch(() => null)]);
  const engine = new RadioEngine(tl, library, { listenerId: opts.listenerId, onSong: opts.onSong, log: opts.log });
  engine.setVolume(opts.volume ?? 1);
  await engine.start();
  return {
    status(): StationStatus {
      const s = engine.status as Record<string, unknown>;
      // paused by a Studio host: the radio is on (the voices carry on), just no song
      const state: StationState = s.state === 'playing' || s.state === 'paused' ? 'playing' : s.state === 'off air' ? 'off-air' : 'starting';
      const tl = engine.timeline;
      const k = s.slot as number | undefined;
      const item = state === 'playing' && tl && k !== undefined ? tl.items[k - tl.firstK] : undefined;
      return {
        state,
        song: item ? { key: item.key, title: item.title, artist: item.artist, durationSec: item.durationSec } : null,
        positionSec: typeof s.positionSec === 'number' ? s.positionSec : null,
        listeners: engine.listeners,
      };
    },
    playhead: () => engine.playhead(),
    setVolume: (v) => engine.setVolume(v),
    setDuck: (l) => engine.setDuck(l),
    setVoiceDuck: (l) => engine.setVoiceDuck(l),
    stop: () => engine.stop(),
    diagnostics: () => diagnosticsOf(engine),
  };
}

export interface ReplayOptions {
  /** The running orders that played during the show (the replay's saved copies). */
  timelines: RadioTimeline[];
  pauses: { start: number; end: number }[];
  /** Server ms of the show to start at. */
  fromMs: number;
  volume?: number;
  log?: (line: string) => void;
}

export interface ReplayStation extends Station {
  /** Server ms of the show being heard now. */
  nowMs(): number;
}

/**
 * Plays a show back: the same engine and the same mixes, on a clock of its own that starts at
 * [fromMs]. Call from a click. Seeking = stop, then start again from the new place.
 */
export async function startReplay(opts: ReplayOptions): Promise<ReplayStation> {
  const t0 = performance.now() + 600;
  const clock = (perfMs: number) => opts.fromMs + (perfMs - t0);
  const engine = new RadioEngine(null, [], { autodj: false, log: opts.log, replay: { clock, timelines: opts.timelines, pauses: opts.pauses } });
  engine.setVolume(opts.volume ?? 1);
  await engine.start();
  return {
    nowMs: () => clock(performance.now()),
    status(): StationStatus {
      const s = engine.status as Record<string, unknown>;
      return { state: s.state === 'playing' ? 'playing' : 'starting', song: null, positionSec: typeof s.positionSec === 'number' ? s.positionSec : null, listeners: null };
    },
    playhead: () => engine.playhead(),
    setVolume: (v) => engine.setVolume(v),
    setDuck: (l) => engine.setDuck(l),
    setVoiceDuck: (l) => engine.setVoiceDuck(l),
    stop: () => engine.stop(),
  };
}
