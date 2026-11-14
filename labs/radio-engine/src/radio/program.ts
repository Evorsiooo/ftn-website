// A mix as data. BitChord's Automix schedules a mix by calling Web Audio
// (gains, EQ, filters) and its decks (play, pause, rate, loop changes) on the
// live AudioContext clock. The radio needs that same mix as a recording that
// every listener can replay at a server-agreed instant, including one who
// tunes in halfway through it. So the planner runs BitChord's own scheduling
// code (transition-scheduler.ts, loopMix.ts and the loop handover from
// autodj.ts) against stand-in decks that write every call down, and this file
// plays the recording back onto real decks.
import type { LoopChange } from '../bitchord/automix/engine/loopDeck';
import { Timeline, type TimelinePoint } from '../bitchord/automix/engine/timeline';

export type DeckId = 'outEl' | 'inEl' | 'outLoop' | 'inLoop';
export type ParamId = 'gain' | 'low' | 'mid' | 'high' | 'hp' | 'lp';

export type ParamOp =
  | { op: 'set'; v: number; at: number }
  | { op: 'lin'; v: number; at: number }
  | { op: 'exp'; v: number; at: number }
  | { op: 'curve'; values: number[]; at: number; dur: number }
  | { op: 'target'; v: number; at: number; tc: number }
  | { op: 'cancel'; at: number };

export interface ParamEvent {
  deck: DeckId;
  param: ParamId;
  e: ParamOp;
}
export interface TransportPoint extends TimelinePoint {
  deck: 'outEl' | 'inEl';
}
export interface LoopPoint extends LoopChange {
  deck: 'outLoop' | 'inLoop';
}
export interface LoopRegion {
  deck: 'outLoop' | 'inLoop';
  side: 'out' | 'in';
  startSec: number;
  endSec: number;
}

/** Every time is in seconds from the mix's start. */
export interface MixProgram {
  /** In call order: cancelScheduledValues only makes sense in that order. */
  params: ParamEvent[];
  /** Each element deck's timeline points (AutoMix's Timeline semantics). */
  transport: TransportPoint[];
  /** The stretch decks' changes, for a loop mix. */
  loops: LoopPoint[];
  /** The stretch of each song the loop decks hold. */
  regions: LoopRegion[];
}

/** The value a parameter rests at on a fresh deck. */
export const PARAM_REST: Record<ParamId, number> = { gain: 1, low: 0, mid: 0, high: 0, hp: 20, lp: 20000 };
export const LOOP_GAIN_REST = 0;

// ---- Recording ------------------------------------------------------------------------------

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** A recording session: stand-in decks for one mix, on a stand-in clock that stands still at 0. */
export class Recorder {
  readonly params: ParamEvent[] = [];
  readonly transport: TransportPoint[] = [];
  readonly loops: LoopPoint[] = [];
  readonly regions: LoopRegion[] = [];
  /** BitChord's code reads ctx.currentTime as "now". */
  readonly ctx = { currentTime: 0 } as unknown as AudioContext;
  private open = true;

  close(): void {
    this.open = false;
  }

  private param(deck: DeckId, param: ParamId, rest: number) {
    // calls that arrive after the recording (BitChord's setTimeout cleanups) are
    // dropped: the player does that cleanup itself when a mix is over
    const push = (e: ParamOp) => {
      if (this.open) this.params.push({ deck, param, e });
    };
    const p = {
      value: rest,
      cancelScheduledValues: (at: number) => (push({ op: 'cancel', at }), p),
      setValueAtTime: (v: number, at: number) => (push({ op: 'set', v, at }), p),
      linearRampToValueAtTime: (v: number, at: number) => (push({ op: 'lin', v, at }), p),
      exponentialRampToValueAtTime: (v: number, at: number) => (push({ op: 'exp', v, at }), p),
      setValueCurveAtTime: (values: ArrayLike<number>, at: number, dur: number) => (push({ op: 'curve', values: Array.from(values), at, dur }), p),
      setTargetAtTime: (v: number, at: number, tc: number) => (push({ op: 'target', v, at, tc }), p),
    };
    return p;
  }

  private eq(deck: DeckId) {
    const bands = { low: this.param(deck, 'low', 0), mid: this.param(deck, 'mid', 0), high: this.param(deck, 'high', 0) };
    return {
      setGain() {},
      getGain: () => 0,
      setGainAt: (band: 'low' | 'mid' | 'high', dB: number, t: number) => bands[band].setValueAtTime(dB, t),
      rampGain: (band: 'low' | 'mid' | 'high', fromDb: number, toDb: number, start: number, dur: number) => {
        bands[band].setValueAtTime(fromDb, start);
        bands[band].linearRampToValueAtTime(toDb, start + dur);
      },
      reset() {},
    };
  }

  /** A stand-in for engine/deck.ts's Deck: AutoMix's Timeline and the same transport arithmetic. */
  elementDeck(deck: 'outEl' | 'inEl', start?: TimelinePoint) {
    const timeline = new Timeline();
    if (start) timeline.add(start);
    const ctx = this.ctx;
    const transport = this.transport;
    const isOpen = () => this.open;
    const change = (p: TimelinePoint) => {
      if (!isOpen()) return;
      timeline.add(p);
      // the Timeline drops points at or after a new one; so does the recording
      for (let i = transport.length - 1; i >= 0; i--) {
        if (transport[i]!.deck === deck && transport[i]!.output >= p.output) transport.splice(i, 1);
      }
      transport.push({ deck, ...p });
    };
    const scheduleAhead = 0.17; // Deck's default latencySec 0.12 + 0.05
    return {
      id: deck,
      ctx,
      timeline,
      scheduleAhead,
      latencySec: 0.12,
      gain: { gain: this.param(deck, 'gain', 1) },
      eq: this.eq(deck),
      sweep: { highpass: { frequency: this.param(deck, 'hp', 20) }, lowpass: { frequency: this.param(deck, 'lp', 20000) } },
      get expectedTrackTime() {
        return timeline.trackTimeAt(ctx.currentTime);
      },
      // engine/deck.ts, verbatim arithmetic
      playAt({ ctxTime, trackTime, rate = 1 }: { ctxTime?: number; trackTime: number; rate?: number }) {
        change({ output: ctxTime ?? ctx.currentTime + scheduleAhead, input: trackTime, rate, active: true });
      },
      setRate(rate: number, atCtxTime?: number) {
        const output = atCtxTime ?? ctx.currentTime + scheduleAhead;
        const input = timeline.trackTimeAt(output);
        if (input === null) return;
        change({ output, input, rate, active: timeline.activeAt(output) });
      },
      pauseAt(ctxTime: number) {
        const input = timeline.trackTimeAt(ctxTime) ?? 0;
        const rate = timeline.rateAt(ctxTime) || 1;
        change({ output: ctxTime, input, rate, active: false });
      },
      setVolume() {},
      resetSweep() {},
      cancel() {},
      lock() {},
      unfollow() {},
      release() {},
    };
  }

  /** A stand-in for engine/loopDeck.ts's LoopDeck. */
  loopDeck(deck: 'outLoop' | 'inLoop') {
    const loops = this.loops;
    const regions = this.regions;
    const isOpen = () => this.open;
    return {
      ctx: this.ctx,
      gain: { gain: this.param(deck, 'gain', 0) },
      eq: this.eq(deck),
      sweep: { highpass: { frequency: this.param(deck, 'hp', 20) }, lowpass: { frequency: this.param(deck, 'lp', 20000) } },
      schedule(changes: LoopChange[]) {
        if (isOpen()) loops.push(...changes.map((c) => ({ deck, ...c })));
      },
      region(side: 'out' | 'in', startSec: number, endSec: number) {
        regions.push({ deck, side, startSec, endSec });
      },
      stop() {},
    };
  }

  /** The recording, with every time moved to "seconds from [t0]" and rounded. */
  program(t0: number): MixProgram {
    const shiftOp = (e: ParamOp): ParamOp => {
      switch (e.op) {
        case 'curve':
          return { op: 'curve', values: e.values.map(r6), at: r6(e.at - t0), dur: r6(e.dur) };
        case 'target':
          return { op: 'target', v: r6(e.v), at: r6(e.at - t0), tc: r6(e.tc) };
        case 'cancel':
          return { op: 'cancel', at: r6(e.at - t0) };
        default:
          return { op: e.op, v: r6(e.v), at: r6(e.at - t0) };
      }
    };
    return {
      params: this.params.map((p) => ({ deck: p.deck, param: p.param, e: shiftOp(p.e) })),
      transport: this.transport.map((p) => ({ deck: p.deck, output: r6(p.output - t0), input: r6(p.input), rate: r6(p.rate), active: p.active })),
      loops: this.loops.map((c) => ({
        deck: c.deck,
        output: r6(c.output - t0),
        input: r6(c.input),
        rate: r6(c.rate),
        active: c.active,
        loop: c.loop ? [r6(c.loop[0]), r6(c.loop[1])] : null,
      })),
      regions: this.regions.map((r) => ({ ...r, startSec: r6(r.startSec), endSec: r6(r.endSec) })),
    };
  }
}

/** FNV-1a over the program's JSON: equal programs, equal hashes, in every browser. */
export function hashProgram(p: MixProgram): string {
  const s = JSON.stringify(p);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ---- Playing back -----------------------------------------------------------------------------

/** An automation event on the real clock (context seconds). */
export type AbsOp = ParamOp;

/** Applies cancelScheduledValues in call order, then sorts by time, as Web Audio keeps its event list. */
export function effectiveEvents(ops: AbsOp[]): AbsOp[] {
  let list: AbsOp[] = [];
  for (const e of ops) {
    if (e.op === 'cancel') {
      list = list.filter((x) => x.at < e.at);
      continue;
    }
    // a new event at the same time as one of the same kind replaces it
    list = list.filter((x) => !(x.at === e.at && x.op === e.op));
    list.push(e);
  }
  return list.map((e, i) => [e, i] as const).sort((a, b) => a[0].at - b[0].at || a[1] - b[1]).map(([e]) => e);
}

function curveAt(e: Extract<AbsOp, { op: 'curve' }>, t: number): number {
  const n = e.values.length;
  if (t >= e.at + e.dur || n === 1) return e.values[n - 1]!;
  const x = Math.max(0, ((t - e.at) / e.dur) * (n - 1));
  const i = Math.floor(x);
  const a = e.values[i]!;
  const b = e.values[Math.min(n - 1, i + 1)]!;
  return a + (b - a) * (x - i);
}

/** The Web Audio value of a parameter at time [t], given its rest value and its (effective) events. */
export function valueAt(list: AbsOp[], rest: number, t: number): number {
  let v = rest;
  let vTime = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!;
    if (e.op === 'cancel') continue;
    if (e.at > t) {
      if (e.op === 'lin' && Number.isFinite(vTime)) return v + ((e.v - v) * (t - vTime)) / (e.at - vTime);
      if (e.op === 'exp' && Number.isFinite(vTime) && v > 0 && e.v > 0) return v * Math.pow(e.v / v, (t - vTime) / (e.at - vTime));
      return v;
    }
    switch (e.op) {
      case 'set':
      case 'lin':
      case 'exp':
        v = e.v;
        vTime = e.at;
        break;
      case 'curve':
        if (t < e.at + e.dur) return curveAt(e, t);
        v = e.values[e.values.length - 1]!;
        vTime = e.at + e.dur;
        break;
      case 'target': {
        const next = list[i + 1];
        const until = next && next.at <= t ? next.at : t;
        v = e.v + (v - e.v) * Math.exp(-(until - e.at) / e.tc);
        vTime = until;
        if (until === t) return v;
        break;
      }
    }
  }
  return v;
}

/**
 * Puts a parameter on [ops] from [now] on: its value at [now], then every
 * event still ahead, an in-progress ramp or curve picked up where it is.
 * The same result as having scheduled [ops] in advance, for a listener who
 * arrives late.
 */
export function replayParam(param: AudioParam, ops: AbsOp[], rest: number, now: number): void {
  const list = effectiveEvents(ops);
  param.cancelScheduledValues(0);
  const inCurve = list.find((e) => e.op === 'curve' && e.at < now && e.at + e.dur > now) as
    | Extract<AbsOp, { op: 'curve' }>
    | undefined;
  if (!inCurve) param.setValueAtTime(valueAt(list, rest, now), now);
  for (const e of list) {
    if (e.op === 'cancel') continue;
    try {
      if (e.op === 'curve') {
        if (e.at >= now) param.setValueCurveAtTime(Float32Array.from(e.values), e.at, e.dur);
        else if (e === inCurve) {
          const start = now + 0.002;
          const end = e.at + e.dur;
          const n = Math.max(2, Math.ceil(e.values.length * ((end - start) / e.dur)) + 1);
          const values = new Float32Array(n);
          for (let i = 0; i < n; i++) values[i] = curveAt(e, start + ((end - start) * i) / (n - 1));
          param.setValueCurveAtTime(values, start, end - start);
        }
        continue;
      }
      if (e.at <= now) continue;
      if (e.op === 'set') param.setValueAtTime(e.v, e.at);
      else if (e.op === 'lin') param.linearRampToValueAtTime(e.v, e.at);
      else if (e.op === 'exp') param.exponentialRampToValueAtTime(e.v, e.at);
      else if (e.op === 'target') param.setTargetAtTime(e.v, e.at, e.tc);
    } catch (err) {
      console.warn('radio: automation event skipped', e, err);
    }
  }
}

/** Moves a recorded op onto the context clock, its mix starting at [t0]. */
export function shiftOp(e: ParamOp, t0: number): AbsOp {
  return { ...e, at: e.at + t0 } as AbsOp;
}

/**
 * The loop deck's changes from [now] on. A change already due is replaced
 * by one at [now] at the position it has reached (wrapped inside its loop),
 * so a late listener's deck lands on the same beat as everyone's.
 */
export function loopChangesFrom(changes: LoopChange[], now: number): LoopChange[] {
  const sorted = [...changes].sort((a, b) => a.output - b.output);
  const future = sorted.filter((c) => c.output >= now);
  const past = sorted.filter((c) => c.output < now);
  const current = past[past.length - 1];
  if (!current || !current.active) return future;
  let input = current.input + (now - current.output) * current.rate;
  if (current.loop) {
    const [a, b] = current.loop;
    if (input >= b) input = a + ((input - a) % (b - a));
  }
  return [{ ...current, output: now, input }, ...future];
}
