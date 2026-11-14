// The radio's timeline: what every listener's browser plays, and when.
// Spec: /mnt/project-files/plans/radio/timeline.md (copy in docs/timeline.md).
//
// The server only stores this JSON and the audio files. Everything below is
// pure arithmetic every browser does the same way, so two browsers that agree
// on the server's clock agree on the song, its position and the mix.
import type { LoopMixPlan } from '../bitchord/automix/engine/loopMix';
import type { TransitionPlan } from '../bitchord/automix/engine/transition-scheduler';
import type { MixProgram } from './program';

export const TIMELINE_VERSION = 1;

export interface TimelineItem {
  /** R2 object key of the audio file, e.g. "songs/abc123.m4a". */
  key: string;
  title: string;
  artist: string;
  /** Decoded duration, seconds. */
  durationSec: number;
  /**
   * YouTube's loudness_db figure (dB above YouTube's reference, about
   * -14 LUFS): what BitChord's phone levels by. From the downloader when
   * YouTube gave one, otherwise measured in the browser that planned the
   * timeline (integrated EBU R128 loudness + 14). Null: no levelling.
   */
  loudnessDb: number | null;
}

/**
 * How items[i] hands over to items[i + 1]. Times inside [program] are seconds
 * from the mix's start (t = 0 is the instant the outgoing song is at [outSec]).
 */
export interface TimelineMix {
  style: TransitionPlan['style'] | 'cut';
  /** Outgoing song's position (s) at the mix's start. */
  outSec: number;
  /** Seconds from the mix's start until the incoming song plays alone at rate 1. */
  settleSec: number;
  /** Incoming song's position (s) at [settleSec]. */
  inEndSec: number;
  /** When the app moves "now playing" to the incoming song, seconds from the mix's start. */
  handoffSec: number;
  /** Why it isn't beatmatched, as BitChord's stats for nerds says it. */
  reason: string | null;
  /** BitChord's loop-mix plan, for a 'loop' mix (display only: [program] is what plays). */
  loop?: LoopMixPlan | null;
  /** Everything the decks do during the mix: BitChord's own scheduling calls, recorded. */
  program: MixProgram;
  /** Short hash of [program], to compare a listener's own plan with this one. */
  hash: string;
}

export interface RadioTimeline {
  version: 1;
  id: string;
  /** Server ms (Unix epoch) at which items[0] is at [startSec]. */
  anchorMs: number;
  startSec: number;
  /** After the last item, start over with items[0] (via mixes[n - 1]). */
  repeat: boolean;
  items: TimelineItem[];
  /** mixes[i] joins items[i] to items[(i + 1) % n]; n - 1 of them without repeat. */
  mixes: TimelineMix[];
  /** Automix settings it was planned with, and the engine version. */
  plannedWith: { bars: number; analysisVersion: number; engine: string };
}

/** One song's stay on the air, in server ms. */
export interface Slot {
  /** Global index: cycle * n + item index. Decides the deck (even A, odd B). */
  k: number;
  item: TimelineItem;
  itemIndex: number;
  /** Server ms the song first sounds (its incoming mix start, or the anchor). */
  startMs: number;
  /** Server ms the song plays alone at rate 1 from [soloFromSec]. */
  soloFromMs: number;
  soloFromSec: number;
  /** The mix that brings it in (null for the first song after the anchor). */
  mixIn: { mix: TimelineMix; t0Ms: number } | null;
  /** The mix that takes it out (null at the end of a non-repeating timeline). */
  mixOut: { mix: TimelineMix; t0Ms: number } | null;
  /** Server ms the song is gone. */
  endMs: number;
}

const mixAfter = (tl: RadioTimeline, i: number): TimelineMix | null => {
  const n = tl.items.length;
  if (i < n - 1) return tl.mixes[i] ?? null;
  return tl.repeat ? (tl.mixes[n - 1] ?? null) : null;
};

/** Seconds from one item's mix-out start to the next item's mix-out start. */
function stepSec(tl: RadioTimeline, i: number): number | null {
  const n = tl.items.length;
  const mix = mixAfter(tl, i);
  const nextMix = mixAfter(tl, (i + 1) % n);
  if (!mix || !nextMix) return null;
  return mix.settleSec + (nextMix.outSec - mix.inEndSec);
}

/** Server ms of the mix out of global slot k (mix t0), walking from the anchor. */
function mixT0Ms(tl: RadioTimeline, k: number): number | null {
  const n = tl.items.length;
  const first = mixAfter(tl, 0);
  if (!first) return null;
  let t = tl.anchorMs + (first.outSec - tl.startSec) * 1000;
  if (k === 0) return t;
  if (!tl.repeat && k > n - 2) return null;
  let period = 0;
  for (let i = 0; i < n; i++) period += stepSec(tl, i) ?? NaN;
  const cycles = tl.repeat && Number.isFinite(period) ? Math.floor(k / n) : 0;
  t += cycles * period * 1000;
  for (let j = cycles * n; j < k; j++) {
    const s = stepSec(tl, j % n);
    if (s === null) return null;
    t += s * 1000;
  }
  return t;
}

/** The slot of global index k. */
export function slotAt(tl: RadioTimeline, k: number): Slot | null {
  const n = tl.items.length;
  if (k < 0 || (!tl.repeat && k >= n)) return null;
  const i = k % n;
  const item = tl.items[i]!;
  const outMix = mixAfter(tl, i);
  const outT0 = outMix ? mixT0Ms(tl, k) : null;
  let mixIn: Slot['mixIn'] = null;
  let startMs: number;
  let soloFromMs: number;
  let soloFromSec: number;
  if (k === 0) {
    startMs = tl.anchorMs;
    soloFromMs = tl.anchorMs;
    soloFromSec = tl.startSec;
  } else {
    const prev = mixAfter(tl, (k - 1) % n)!;
    const t0 = mixT0Ms(tl, k - 1)!;
    mixIn = { mix: prev, t0Ms: t0 };
    startMs = t0 + firstSoundSec(prev.program, 'in') * 1000;
    soloFromMs = t0 + prev.settleSec * 1000;
    soloFromSec = prev.inEndSec;
  }
  const endMs =
    outMix && outT0 !== null
      ? outT0 + lastSoundSec(outMix.program, 'out') * 1000
      : soloFromMs + (item.durationSec - soloFromSec) * 1000;
  return {
    k,
    item,
    itemIndex: i,
    startMs,
    soloFromMs,
    soloFromSec,
    mixIn,
    mixOut: outMix && outT0 !== null ? { mix: outMix, t0Ms: outT0 } : null,
    endMs,
  };
}

/** The global index of the slot whose solo-or-mix-out part holds [serverMs] (the song "on air"). */
export function slotIndexAt(tl: RadioTimeline, serverMs: number): number | null {
  if (serverMs < tl.anchorMs) return null;
  const n = tl.items.length;
  // jump whole cycles first
  let k = 0;
  if (tl.repeat) {
    let period = 0;
    for (let i = 0; i < n; i++) period += stepSec(tl, i) ?? NaN;
    const t0 = mixT0Ms(tl, 0);
    if (Number.isFinite(period) && period > 0 && t0 !== null && serverMs > t0) {
      k = Math.max(0, Math.floor((serverMs - t0) / (period * 1000)) * n);
    }
  }
  for (let guard = 0; guard < 4 * n + 4; guard++) {
    const slot = slotAt(tl, k);
    if (!slot) return null;
    const handoff = slot.mixOut ? slot.mixOut.t0Ms + slot.mixOut.mix.handoffSec * 1000 : slot.endMs;
    if (serverMs < handoff) return k;
    k++;
  }
  return null;
}

/** Earliest output time (s from the mix start) at which a side of a mix plays. */
export function firstSoundSec(p: MixProgram, side: 'in' | 'out'): number {
  const deck = side === 'in' ? 'inEl' : 'outEl';
  const loop = side === 'in' ? 'inLoop' : 'outLoop';
  const times = [
    ...p.transport.filter((c) => c.deck === deck && c.active).map((c) => c.output),
    ...p.loops.filter((c) => c.deck === loop && c.active).map((c) => c.output),
  ];
  return times.length ? Math.min(...times) : 0;
}

/** Last time (s from the mix start) the outgoing song is heard. */
export function lastSoundSec(p: MixProgram, side: 'out'): number {
  void side;
  const stops = [
    ...p.transport.filter((c) => c.deck === 'outEl' && !c.active).map((c) => c.output),
    ...p.loops.filter((c) => c.deck === 'outLoop' && !c.active).map((c) => c.output),
  ];
  return stops.length ? Math.max(...stops) : 0;
}

/** What a listener shows: the song on air and where it is (approximate inside a loop mix). */
export function nowPlaying(tl: RadioTimeline, serverMs: number): { slot: Slot; positionSec: number } | null {
  const k = slotIndexAt(tl, serverMs);
  if (k === null) return null;
  const slot = slotAt(tl, k)!;
  const positionSec = slot.soloFromSec + (serverMs - slot.soloFromMs) / 1000;
  return { slot, positionSec };
}
