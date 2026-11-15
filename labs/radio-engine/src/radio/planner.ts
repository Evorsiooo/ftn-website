// Plans a timeline's mixes with BitChord's Automix, in the browser.
//
// For each pair of songs it does what BitChord's AutoDJ (engine/autodj.ts)
// does when the next song comes up: a loop mix when both songs have usable
// beat grids and instrumental bars (planLoopMix, scheduleLoopMix and the
// element handover from AutoDJ.scheduleLoop), otherwise AutoMix's blend, the
// phone's filter mix, or the plain 12 s crossfade (scheduleTransition). The
// calls are made against Recorder stand-ins (program.ts), so the result is
// the exact list of things BitChord would have scheduled, as data.
import { analyzer } from '../bitchord/automix/analysis/analyzer';
import type { TrackAnalysis } from '../bitchord/automix/analysis/types';
import type { Deck } from '../bitchord/automix/engine/deck';
import { asOutgoing } from '../bitchord/automix/engine/grid';
import type { LoopDeck } from '../bitchord/automix/engine/loopDeck';
import { IN_REGION_SEC, OUT_REGION_SEC, planLoopMix, scheduleLoopMix } from '../bitchord/automix/engine/loopMix';
import { MIN_GRID_CONFIDENCE, scheduleTransition } from '../bitchord/automix/engine/transition-scheduler';
import { songBytes } from './fetchAudio';
import { hashProgram, Recorder } from './program';
import type { TimelineMix } from './timeline';

/** AutoDJ.transitionBars: BitChord's default blend length. */
export const DEFAULT_BARS = 16;
/** autodj.ts LOOP_SETUP_SEC: the outgoing loop starts at least this far past the playhead. */
const LOOP_SETUP_SEC = 15;
/** autodj.ts: the crossfade fallback lands this long before the outro (or the end). */
const FALLBACK_SEC = 12;
/** A mix is recorded from this long before it starts. */
const LEAD_IN_SEC = 30;
/** Decoding rate for planning, fixed so every browser measures the same samples. */
const PLAN_SR = 44100;

export interface SongRef {
  key: string;
  title: string;
  artist: string;
  /** From the downloader (YouTube's loudness_db), when it had one. */
  loudnessDb?: number | null;
}

export async function decodeForPlan(key: string): Promise<AudioBuffer> {
  const bytes = await songBytes(key);
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 1, sampleRate: PLAN_SR });
  return ctx.decodeAudioData(bytes.slice(0));
}

/** Waits for BitChord's analyzer (IndexedDB-cached) to finish [key]. */
export function analyse(key: string, tags: { title: string; artist: string }): Promise<TrackAnalysis> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const done = analyzer.get(key);
      if (done) {
        off();
        resolve(done);
      } else if (analyzer.statusOf(key) === 'error') {
        off();
        reject(new Error(`analysis failed: ${key}`));
      }
    };
    const off = analyzer.subscribe(check);
    analyzer.request(key, tags, true);
    check();
  });
}

/**
 * One mix, from [from] into [to]. [fromPos] is where the outgoing song
 * starts playing alone (the end of the mix that brought it in): nothing is
 * planned before it.
 */
export function planMix(
  from: TrackAnalysis,
  to: TrackAnalysis,
  fromBuffer: AudioBuffer | null,
  toBuffer: AudioBuffer | null,
  fromPos: number,
  bars = DEFAULT_BARS,
): TimelineMix {
  const cur = asOutgoing(from);
  // 1. BitChord's loop mix (AutoDJ.prepareLoopMix + scheduleLoop)
  if (fromBuffer && toBuffer && cur.gridConfidence >= MIN_GRID_CONFIDENCE && to.gridConfidence >= MIN_GRID_CONFIDENCE) {
    const plan = planLoopMix(cur, fromBuffer, to, toBuffer, fromPos + LOOP_SETUP_SEC, {});
    if (plan) {
      const rec = new Recorder();
      // start the recording a little before the loop (the plan doesn't depend on it), so
      // the program's times stay short however far ahead the mix is planned
      const startPos = Math.max(fromPos, plan.out.loop[0] - LEAD_IN_SEC);
      const fromDeck = rec.elementDeck('outEl', { output: 0, input: startPos, rate: 1, active: true });
      const toDeck = rec.elementDeck('inEl');
      const outLoop = rec.loopDeck('outLoop');
      const inLoop = rec.loopDeck('inLoop');
      outLoop.region('out', Math.max(0, cur.durationSec - OUT_REGION_SEC), cur.durationSec);
      inLoop.region('in', 0, Math.min(to.durationSec, IN_REGION_SEC));
      const now = 0;
      const t0 = fromDeck.timeline.ctxTimeAt(plan.out.loop[0], now);
      if (t0 !== null && t0 - now >= 1) {
        const times = scheduleLoopMix(plan, outLoop as unknown as LoopDeck, inLoop as unknown as LoopDeck, t0);
        // AutoDJ.scheduleLoop, verbatim: the outgoing element hands its sound to the deck at the loop start, then pauses
        const og = fromDeck.gain.gain;
        og.cancelScheduledValues(now);
        og.setValueAtTime(1, t0 - 0.025);
        og.linearRampToValueAtTime(0, t0);
        fromDeck.pauseAt(t0 + 0.06);
        // the incoming element starts unheard 1.5 s early, held to the deck's clock, and takes over
        const ig = toDeck.gain.gain;
        ig.cancelScheduledValues(now);
        ig.setValueAtTime(0, now);
        ig.setValueAtTime(0, times.elementAt);
        ig.linearRampToValueAtTime(1, times.elementAt + 0.025);
        toDeck.eq.reset();
        toDeck.playAt({ ctxTime: times.elementAt - 1.5, trackTime: times.elementTrackTime - 1.5, rate: 1 });
        rec.close();
        const program = rec.program(t0);
        // after elementAt + 0.1 the incoming loop deck is off and the element plays at rate 1
        const settleSec = times.elementAt - t0 + 0.1;
        return {
          style: 'loop',
          outSec: r6(plan.out.loop[0]),
          settleSec: r3(settleSec),
          inEndSec: r6(times.elementTrackTime + 0.1),
          handoffSec: r3(times.handoffAt - t0),
          reason: null,
          loop: plan,
          program,
          hash: hashProgram(program),
        };
      }
      rec.close();
    }
  }

  // 2. AutoMix's blend, the phone's filter mix, or the crossfade (AutoDJ.scheduleBlend)
  const attempt = (pos: number) => {
    const rec = new Recorder();
    const fromDeck = rec.elementDeck('outEl', { output: 0, input: pos, rate: 1, active: true });
    const toDeck = rec.elementDeck('inEl');
    const plan = scheduleTransition({
      from: fromDeck as unknown as Deck,
      to: toDeck as unknown as Deck,
      fromAnalysis: cur,
      toAnalysis: to,
      bars,
      forceNow: false,
    });
    rec.close();
    return { rec, plan, pos };
  };
  let { rec, plan, pos } = attempt(fromPos);
  if (plan.style !== 'crossfade' && plan.t0 > LEAD_IN_SEC + 5) {
    // same mix, recorded from a little before it, so the program's times stay short
    ({ rec, plan, pos } = attempt(fromPos + plan.t0 - LEAD_IN_SEC));
  }
  if (plan.style === 'crossfade') {
    // AutoDJ.timeToMixOut: with no grid, the crossfade lands 12 s before the outro (or the end)
    const target = (cur.outroStartSec ?? cur.durationSec) - FALLBACK_SEC;
    const earliest = 0.17 + 0.1; // scheduleAhead + 0.1, where scheduleFallback starts
    ({ rec, plan, pos } = attempt(Math.max(fromPos, target - earliest)));
  }
  const program = rec.program(plan.t0);
  const inPoints = program.transport.filter((p) => p.deck === 'inEl');
  const lastIn = inPoints[inPoints.length - 1]!;
  // the incoming song is alone at rate 1 once the outgoing one has stopped and the rate glide is done
  const settleSec = Math.max(lastIn.output, plan.durationSec + 0.05);
  const inEnd = lastIn.input + (settleSec - lastIn.output) * lastIn.rate;
  return {
    style: plan.style,
    outSec: r6(pos + plan.t0),
    settleSec: r3(settleSec),
    inEndSec: r6(inEnd),
    handoffSec: r3(plan.durationSec / 2),
    reason: plan.reason,
    loop: null,
    program,
    hash: hashProgram(program),
  };
}

const r3 = (x: number) => Math.round(x * 1e3) / 1e3;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
