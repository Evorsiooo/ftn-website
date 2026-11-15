// The radio for the website: what components/radio/radio-provider.tsx loads
// (as /radio-engine/site.js) when a listener presses Listen. Wraps the engine
// the lab proved; the page only sees this small surface.
import { fetchTimeline, loadLibrary } from './radio/autodj';
import { RadioEngine } from './radio/engine';
import type { TimelineItem } from './radio/timeline';

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
    stop: () => engine.stop(),
  };
}
