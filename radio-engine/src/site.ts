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
  setVolume(volume: number): void;
  setDuck(level: number): void;
  /** Lowers the music while someone on air talks (1 = full). */
  setVoiceDuck(level: number): void;
  stop(): void;
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
  const [library, tl] = await Promise.all([loadLibrary(), fetchTimeline().catch(() => null)]);
  const engine = new RadioEngine(tl, library, { listenerId: opts.listenerId, onSong: opts.onSong, log: opts.log });
  engine.setVolume(opts.volume ?? 1);
  await engine.start();
  return {
    status(): StationStatus {
      const s = engine.status as Record<string, unknown>;
      const state: StationState = s.state === 'playing' ? 'playing' : s.state === 'off air' ? 'off-air' : 'starting';
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
    setVolume: (v) => engine.setVolume(v),
    setDuck: (l) => engine.setDuck(l),
    setVoiceDuck: (l) => engine.setVoiceDuck(l),
    stop: () => engine.stop(),
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
    setVolume: (v) => engine.setVolume(v),
    setDuck: (l) => engine.setDuck(l),
    setVoiceDuck: (l) => engine.setVoiceDuck(l),
    stop: () => engine.stop(),
  };
}
