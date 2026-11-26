// Adapted from AutoMix's src/lib/engine/deck.ts (https://github.com/heydavidf/automix),
// Copyright (C) 2026 David Finnegan. AGPL-3.0-only: see ../LICENSE and ../NOTICE.md.
//
// BitChord: AutoMix's deck is a signalsmith-stretch worklet over a decoded
// buffer. Here it is one of the player's two <audio> elements (Shaka-fed),
// routed through Web Audio. The public surface is AutoMix's, so the
// transition scheduler runs unchanged: a Timeline mirror of every scheduled
// change, a 3-band EQ, a gain, and changes posted only when imminent. What
// the worklet did sample-accurately, a phase-lock servo does here: while a
// transition is in flight the element is held on its timeline by nudging its
// pitch-preserving playbackRate, or by a seek when it is far off.
// FTN radio lab: adds follow() (below), which puts the deck on a whole
// timeline worked out from the radio's server clock. Nothing else changed.
import { ThreeBandEQ } from './eq';
import { Timeline, type TimelinePoint } from './timeline';

export interface LoadedTrackMeta {
  fileKey: string;
  title: string;
  artist: string;
}

export interface PlayOptions {
  /** AudioContext time to start/take effect. Defaults to "now + latency". */
  ctxTime?: number;
  /** Position in the track to play from (seconds). */
  trackTime: number;
  rate?: number;
}

type Change = { output: number; input: number; rate: number; active: boolean };

/** Off by more than this, a seek; below it, a rate nudge. */
const SEEK_ERROR_SEC = 0.25;
/** Inside this, the element is on the beat (a 16th at 128 BPM is 117 ms). */
const DEADBAND_SEC = 0.006;
/** Largest rate nudge: 3% is below what a listener hears with pitch preserved. */
const MAX_NUDGE = 0.03;
/** Largest rate nudge while the deck's gain is under 0.3. */
const MAX_QUIET_NUDGE = 0.1;
/** Seconds of error corrected per second of playback. */
const SERVO_GAIN = 0.8;
const SERVO_MS = 40;
/**
 * FTN radio: seeks that keep coming back (Safari on a Mac lands AAC seeks short of where it was
 * asked, so the error is still over SEEK_ERROR_SEC and it seeks again, replaying the same bit
 * over and over) put the deck in "loose" mode for a while: it only seeks when it's far off and
 * otherwise drifts with rate nudges. Being a few hundred ms out is fine for a radio; audible
 * repeats aren't.
 */
const SEEK_STORM = { count: 3, windowSec: 10, looseSec: 60, looseErrorSec: 3 };

/**
 * FTN radio: Firefox. Every playbackRate change on a media element makes an audible click there
 * (measured: a 440 Hz tone with a 0.6% rate change every 0.8 s had a discontinuity at each change,
 * none without), and its currentTime jitters by ~20 ms (Chromium ~3 ms), which is over the 6 ms
 * deadband, so the servo above changed the rate about once a second in solo play and 10+ times a
 * second during mixes: the glitching Linux/Firefox listeners heard. In Firefox the servo works on a
 * 1 s median, only starts correcting past 25 ms (stops under 5 ms), corrects with a fixed 1% (3% past
 * 100 ms) and follows a mix's tempo glide in 0.5% steps, so the rate changes a few times a minute.
 */
const COARSE = typeof navigator !== 'undefined' && /Firefox\//.test(navigator.userAgent);
const COARSE_SERVO = { window: 25, startSec: 0.025, stopSec: 0.005, nudge: 0.01, bigErrorSec: 0.1, bigNudge: 0.03, rateStep: 0.005 };

/**
 * One DJ deck: <audio> -> 3-band EQ -> gain (AutoMix's automation) -> fader
 * (the player's own crossfade share) -> master. All transport goes through
 * scheduleChange() on the AudioContext clock and is mirrored into a Timeline
 * for exact trackTime <-> ctxTime conversion.
 */
export class Deck {
  readonly eq: ThreeBandEQ;
  readonly gain: GainNode;
  /** The player's plain-crossfade share and nothing else; AutoMix never touches it. */
  readonly fader: GainNode;
  /** BitChord: the filter mix's high- and low-pass, open (inaudible) except during one. */
  readonly sweep: { highpass: BiquadFilterNode; lowpass: BiquadFilterNode };
  readonly timeline = new Timeline();
  loaded: LoadedTrackMeta | null = null;
  /** How long play() takes to put audio out, learned from each start. */
  latencySec = 0.12;

  private pending: Change[] = [];
  private dispatchTimer: ReturnType<typeof setInterval> | null = null;
  /** True while a transition holds this deck to its timeline. */
  private locked = false;
  /**
   * The deck this one follows while locked: the outgoing track, which is
   * never nudged (the phone never tempo-shifts the deck you hear leaving).
   * This deck's timeline is read at the moment the leader's element is
   * actually at, so the two stay together even when the leader's element
   * drifts from the AudioContext clock.
   */
  private leader: Deck | null = null;
  private errors: number[] = [];
  private seekingUntil = 0;
  private seekTimes: number[] = [];
  private looseUntil = 0;
  /** Firefox: correcting a drift (see COARSE_SERVO). */
  private correcting = false;
  private appliedNudge = 0;

  constructor(
    readonly id: string,
    readonly ctx: AudioContext,
    readonly audio: HTMLAudioElement,
    destination: AudioNode,
  ) {
    this.eq = new ThreeBandEQ(ctx);
    this.gain = new GainNode(ctx, { gain: 1 });
    this.fader = new GainNode(ctx, { gain: 1 });
    this.sweep = {
      highpass: new BiquadFilterNode(ctx, { type: 'highpass', frequency: 20, Q: 0.7 }),
      lowpass: new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 20000, Q: 0.7 }),
    };
    ctx.createMediaElementSource(audio).connect(this.eq.input);
    this.eq.output.connect(this.sweep.highpass).connect(this.sweep.lowpass).connect(this.gain).connect(this.fader).connect(destination);
    audio.preservesPitch = true;
  }

  get durationSec(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  /** Earliest ctx time a new schedule can take full effect. */
  get scheduleAhead(): number {
    return this.latencySec + 0.05;
  }

  /**
   * Model = what the element is doing now. Called while no transition is in
   * flight, so the timeline follows the user's seeks, pauses and the
   * element's own clock.
   */
  anchor(): void {
    if (this.locked || this.pending.length) return;
    const now = this.ctx.currentTime;
    this.timeline.clear();
    this.timeline.add({
      output: now,
      input: this.audio.currentTime,
      rate: this.audio.playbackRate || 1,
      active: !this.audio.paused && !this.audio.ended,
    });
  }

  /**
   * BitChord: anchor() from the median of several readings (the element's
   * clock moves in audio-callback steps), for a handover that has to land on
   * the element's real position: the loop mix.
   */
  async anchorPrecise(samples = 9, spacingMs = 35): Promise<void> {
    if (this.audio.paused) return this.anchor();
    const offsets: number[] = [];
    const rate = this.audio.playbackRate || 1;
    for (let i = 0; i < samples; i++) {
      offsets.push(this.audio.currentTime - this.ctx.currentTime * rate);
      await new Promise((r) => setTimeout(r, spacingMs));
    }
    offsets.sort((a, b) => a - b);
    const offset = offsets[offsets.length >> 1]!;
    const now = this.ctx.currentTime;
    this.timeline.clear();
    this.timeline.add({ output: now, input: offset + now * rate, rate, active: !this.audio.paused });
  }

  /** Sample-accurately schedule playback of trackTime at ctxTime. */
  playAt({ ctxTime, trackTime, rate = 1 }: PlayOptions): void {
    const output = ctxTime ?? this.ctx.currentTime + this.scheduleAhead;
    this.scheduleChange({ output, input: trackTime, rate, active: true });
  }

  /** Change rate while playing, keeping position continuous. */
  setRate(rate: number, atCtxTime?: number): void {
    const output = atCtxTime ?? this.ctx.currentTime + this.scheduleAhead;
    const input = this.timeline.trackTimeAt(output);
    if (input === null) return;
    const active = this.timeline.activeAt(output);
    this.scheduleChange({ output, input, rate, active });
  }

  pause(): void {
    this.pauseAt(this.ctx.currentTime);
  }

  /** Schedule a stop at a future AudioContext time. */
  pauseAt(ctxTime: number): void {
    const input = this.timeline.trackTimeAt(ctxTime) ?? this.audio.currentTime;
    const rate = this.timeline.rateAt(ctxTime) || 1;
    this.scheduleChange({ output: ctxTime, input, rate, active: false });
  }

  /**
   * FTN radio lab: the deck's whole timeline (already on this context's
   * clock), held with the servo for as long as it lasts. Replaces anything
   * scheduled. A start that is already due plays from where it has got to,
   * which is how a listener joins mid-song or mid-mix.
   */
  follow(points: TimelinePoint[]): void {
    const now = this.ctx.currentTime;
    const sorted = [...points].sort((a, b) => a.output - b.output);
    this.timeline.clear();
    for (const p of sorted) this.timeline.add(p);
    const due = sorted.filter((p) => p.output <= now);
    const current = due[due.length - 1];
    this.pending = [...(current ? [current] : []), ...sorted.filter((p) => p.output > now)];
    const first = this.pending[0];
    if (first && first.active && this.audio.paused && first.output - now > 0.5) this.audio.currentTime = first.input;
    this.locked = true;
    this.leader = null;
    this.errors = [];
    this.correcting = false;
    this.appliedNudge = 0;
    this.ensureTimer();
    this.dispatch();
  }

  /** Hold the element to its timeline from now until release(); [leader] is the deck to follow. */
  lock(leader: Deck | null = null): void {
    this.leader = leader;
    this.locked = true;
    this.errors = [];
    this.ensureTimer();
  }

  /** Let the element run free again at the rate the timeline ends on. */
  release(): void {
    this.locked = false;
    this.leader = null;
    const rate = this.timeline.rateAt(this.ctx.currentTime) || 1;
    if (this.pending.length === 0) this.audio.playbackRate = rate;
  }

  /** Drop everything scheduled: automation, pending changes, the servo. */
  cancel(): void {
    this.pending = [];
    this.locked = false;
    this.leader = null;
    this.timeline.clear();
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(1, now);
    this.eq.reset();
    this.resetSweep();
    this.audio.playbackRate = 1;
  }

  /** Opens the filter mix's filters again. */
  resetSweep(): void {
    const now = this.ctx.currentTime;
    for (const [param, open] of [
      [this.sweep.highpass.frequency, 20],
      [this.sweep.lowpass.frequency, 20000],
    ] as const) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(open, now);
    }
  }

  /**
   * AutoMix posted changes to the worklet only when imminent (< 2 s). The
   * element has no scheduler at all, so a change is applied the moment its
   * time comes, less the start latency for a start.
   */
  private scheduleChange(p: Change): void {
    this.timeline.add(p);
    this.pending = this.pending.filter((q) => q.output < p.output);
    this.pending.push(p);
    // The start (the first change, from paused) more than a moment away: put
    // the element there now, so the seek's fetch is done by the time it plays.
    // Later changes (the rate glide) must not move it.
    const first = this.pending[0]!;
    if (first === p && p.active && this.audio.paused && p.output - this.ctx.currentTime > 0.5) {
      this.audio.currentTime = p.input;
    }
    this.ensureTimer();
    this.dispatch();
  }

  private ensureTimer() {
    this.dispatchTimer ??= setInterval(() => this.dispatch(), SERVO_MS);
  }

  private dispatch(): void {
    const now = this.ctx.currentTime;
    while (this.pending.length > 0) {
      const next = this.pending[0]!;
      const lead = next.active && this.audio.paused ? this.latencySec : 0;
      if (next.output - lead > now) break;
      this.pending.shift();
      this.apply(next, now);
    }
    if (this.locked) this.servo(now);
    if (this.pending.length === 0 && !this.locked && this.dispatchTimer !== null) {
      clearInterval(this.dispatchTimer);
      this.dispatchTimer = null;
    }
  }

  private apply(change: Change, now: number) {
    const audio = this.audio;
    if (!change.active) {
      if (!audio.paused) audio.pause();
      return;
    }
    audio.playbackRate = change.rate;
    if (audio.paused) {
      const target = Math.max(0, change.input + Math.max(0, now + this.latencySec - change.output) * change.rate);
      if (Math.abs(audio.currentTime - target) > 0.02) audio.currentTime = target;
      const asked = this.ctx.currentTime;
      const started = () => {
        // How long the element took to move: next start leads by that much.
        const took = this.ctx.currentTime - asked;
        if (took > 0 && took < 1) this.latencySec = this.latencySec * 0.5 + took * 0.5;
      };
      audio.addEventListener('playing', started, { once: true });
      void audio.play().catch(() => {});
    }
  }

  /** Stop following the outgoing deck (it has gone); the clock alone leads from here. */
  unfollow(): void {
    this.leader = null;
  }

  /** The AudioContext time this deck's element is actually at, per its timeline; null when it isn't playing to one. */
  private actualCtxTime(now: number): number | null {
    if (this.audio.paused || this.audio.seeking) return null;
    return this.timeline.ctxTimeAt(this.audio.currentTime, now - 10);
  }

  private servo(now: number) {
    const audio = this.audio;
    // Following the outgoing deck: read this timeline where that element really is.
    const at = this.leader?.actualCtxTime(now) ?? now;
    const expected = this.timeline.trackTimeAt(at);
    const rate = this.timeline.rateAt(at);
    if (expected === null || !this.timeline.activeAt(at) || audio.paused || audio.seeking || now < this.seekingUntil) return;
    const error = audio.currentTime - expected;
    const loose = now < this.looseUntil;
    if (Math.abs(error) > (loose ? SEEK_STORM.looseErrorSec : SEEK_ERROR_SEC)) {
      this.seekTimes = this.seekTimes.filter((t) => now - t < SEEK_STORM.windowSec);
      this.seekTimes.push(now);
      if (!loose && this.seekTimes.length >= SEEK_STORM.count) {
        this.looseUntil = now + SEEK_STORM.looseSec;
        this.seekTimes = [];
        if (Math.abs(error) <= SEEK_STORM.looseErrorSec) return;
      }
      audio.currentTime = expected + this.latencySec * rate;
      this.seekingUntil = now + 0.3;
      this.errors = [];
      return;
    }
    // currentTime moves in audio-callback steps; a short median keeps the
    // nudge from chasing that jitter.
    this.errors.push(error);
    if (this.errors.length > (COARSE ? COARSE_SERVO.window : 5)) this.errors.shift();
    const smoothed = [...this.errors].sort((a, b) => a - b)[this.errors.length >> 1]!;
    if (COARSE) return this.coarseServo(smoothed, rate);
    // While the deck is still quiet (an incoming track's first bars) it may
    // be pulled harder: nobody hears a 10% nudge at -20 dB.
    const limit = this.gain.gain.value < 0.3 ? MAX_QUIET_NUDGE : MAX_NUDGE;
    const nudge = Math.abs(smoothed) < DEADBAND_SEC ? 0 : Math.max(-limit, Math.min(limit, -smoothed * SERVO_GAIN * (limit / MAX_NUDGE)));
    const want = rate * (1 + nudge);
    if (Math.abs(audio.playbackRate - want) > 0.0015) audio.playbackRate = want;
  }

  /** Firefox's servo (see COARSE_SERVO): few, steady rate changes. */
  private coarseServo(smoothed: number, rate: number) {
    const c = COARSE_SERVO;
    const size = Math.abs(smoothed);
    if (this.errors.length < c.window && !this.correcting && size < c.bigErrorSec) return; // not enough readings yet
    if (!this.correcting && size > c.startSec) this.correcting = true;
    else if (this.correcting && size < c.stopSec) this.correcting = false;
    const nudge = this.correcting ? -Math.sign(smoothed) * (size > c.bigErrorSec ? c.bigNudge : c.nudge) : 0;
    const want = rate * (1 + nudge);
    // a nudge starting, changing or ending applies at once; a mix's tempo glide only in steps
    const settled = rate === 1 && nudge === 0 && this.audio.playbackRate !== 1; // a glide's last small step
    if (nudge !== this.appliedNudge || settled || Math.abs(this.audio.playbackRate - want) > c.rateStep) {
      this.appliedNudge = nudge;
      if (Math.abs(this.audio.playbackRate - want) > 0.0015) this.audio.playbackRate = want;
    }
  }

  get isPlaying(): boolean {
    return !this.audio.paused;
  }

  /** Expected track position right now per the timeline (model truth). */
  get expectedTrackTime(): number | null {
    return this.timeline.trackTimeAt(this.ctx.currentTime);
  }

  /** Reported track position from the element (measured truth). */
  get reportedTrackTime(): number {
    return this.audio.currentTime;
  }

  setVolume(v: number): void {
    try {
      this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    } catch {
      // param is locked by an active setValueCurveAtTime (mid-transition) — ignore
    }
  }
}
