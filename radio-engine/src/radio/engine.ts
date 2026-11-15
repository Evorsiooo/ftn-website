// The listener: plays the timeline in step with everyone else.
//
// - Clock: BitChord's Listen Together ServerClock (party/clock.ts), fed by
//   pings to the website's time endpoint on BitChord's schedule (four pings
//   300 ms apart, then one every 15 s; the shortest round trip wins).
// - Decks: BitChord's Automix decks. Two <audio> elements through Web Audio
//   (engine/deck.ts, held on their timeline by its servo) and two
//   signalsmith-stretch loop decks (engine/loopDeck.ts) for loop mixes.
// - Mixes: the timeline's recorded BitChord programs, replayed from the
//   moment this listener is at (program.ts).
// - Loudness: BitChord's phone formula on each deck's fader (loudness.ts).
// - AutoDJ: this listener lines up the next song when it's needed (autodj.ts).
import { ServerClock, monotonicNow } from '../bitchord/party/clock';
import { Deck } from '../bitchord/automix/engine/deck';
import { LoopDeck } from '../bitchord/automix/engine/loopDeck';
import type { TimelinePoint } from '../bitchord/automix/engine/timeline';
import { AUTODJ_WRITE_URL, fileUrl, TIME_URL } from './config';
import { extend, fetchTimeline, loadLibrary, needsWork } from './autodj';
import { songBytes } from './fetchAudio';
import { loudnessGain } from './loudness';
import { LOOP_GAIN_REST, PARAM_REST, loopChangesFrom, replayParam, shiftOp, type AbsOp, type DeckId, type ParamId } from './program';
import { endOfTimelineMs, nowPlaying, slotAt, slotIndexAt, type LibrarySong, type RadioTimeline, type Slot, type TimelineMix } from './timeline';
import { fetchProgram, type RadioProgram } from './programFile';

/** listenTogether.ts: PING_INTERVAL_MS, and the four quick pings on connect. */
const PING_INTERVAL_MS = 15_000;
/**
 * After the first two minutes the clock is pinned and device clocks drift a
 * few ms a minute at most, so pings slow down: each one is a request to the
 * website, and its free tier allows 100,000 a day.
 */
const SLOW_PING_AFTER_MS = 120_000;
const SLOW_PING_INTERVAL_MS = 60_000;
/**
 * Every this many pings, the ping also says "I'm listening" (for the
 * listener count). That answer is slower (a database call), and the clock
 * only trusts the quickest round trips, so most pings stay plain.
 */
const COUNT_EVERY_PINGS = 5;
/** The library is fetched again this often (songs added or archived in the admin panel). */
const LIBRARY_REFRESH_MS = 10 * 60_000;
const TICK_MS = 250;
/** Songs and loop decks are made ready this far ahead. */
const HORIZON_MS = 45_000;
/** Re-put the decks on the clock when the server-to-context mapping has moved this much. */
const RETIME_SEC = 0.004;
/** How often the running order is fetched again (another listener may have added a song). */
const REFRESH_MS = 10_000;

type Status = Record<string, unknown>;

interface Held {
  k: number;
  /** The song's mixes as last put on the deck: a new mix after it means doing it again. */
  sig: string;
  key: string;
  /** Context time this deck's timeline was computed for, and the server ms it stood for. */
  refServerMs: number;
  refCtx: number;
}

export interface EngineOptions {
  /** Test only: this device's clock is off by this much (the sync must hide it). */
  skewMs?: number;
  /** Take part in the AutoDJ: line up songs when needed (default on). */
  autodj?: boolean;
  /** Sent with clock pings so the website can count listeners. */
  listenerId?: string;
  /** The song on air changed (for the lock screen and the page). */
  onSong?: (item: Slot['item']) => void;
  log?: (line: string) => void;
  /**
   * Replays: a clock of our own instead of the website's (server ms for a performance.now()
   * time), and the running orders that played, in place of the live one. Nothing is fetched
   * or lined up.
   */
  replay?: { clock: (perfMs: number) => number; timelines: RadioTimeline[]; pauses: { start: number; end: number }[] };
}

export class RadioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  private readonly out: GainNode;
  /** Music only: down to 0 while a Studio host has paused it, lowered while someone on air talks. */
  private readonly music: GainNode;
  private musicLevel = 1;
  private voiceDuck = 1;
  private paused = false;
  /** Shows, the Studio's queue and pause (radio/program.json). */
  program: RadioProgram | null = null;
  /** The running order being played (the live one, or a replay's at this moment). */
  private playing: RadioTimeline | null = null;
  private volume = 1;
  private duck = 1;
  /** Listeners on now, from the last clock ping (null until the website says). */
  listeners: number | null = null;
  private startedAt = 0;
  readonly clock: ServerClock;
  readonly elements: [HTMLAudioElement, HTMLAudioElement];
  readonly decks: [Deck, Deck];
  private loopDecks: Promise<[LoopDeck, LoopDeck]> | null = null;
  private loopLoudness: [GainNode, GainNode] | null = null;
  private held: [Held | null, Held | null] = [null, null];
  private loopHeld: { k: number; ready: boolean; preparing: boolean; scheduledFor: number | null } | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private stopped = false;
  private mapping: number[] = [];
  private lastSlotK: number | null = null;
  private working = false;
  private nextWorkAt = 0;
  private workNote: string | null = null;
  readonly skewMs: number;
  /** For the test page: when the timers ran late (an iPhone with its screen locked). */
  maxTickGapMs = 0;
  private lastTick = 0;
  status: Status = {};

  constructor(
    public timeline: RadioTimeline | null,
    private library: LibrarySong[],
    private readonly opts: EngineOptions = {},
  ) {
    this.skewMs = opts.skewMs ?? 0;
    const skew = this.skewMs;
    this.clock = new ServerClock(() => monotonicNow() + skew);
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    this.master = new GainNode(this.ctx, { gain: 1 });
    // listener volume and ducking sit after the mix, so they never touch what everyone hears in step
    this.out = new GainNode(this.ctx, { gain: 1 });
    this.music = new GainNode(this.ctx, { gain: 1 });
    this.master.connect(this.music).connect(this.out).connect(this.ctx.destination);
    const make = () => {
      const a = new Audio();
      a.preload = 'auto';
      a.crossOrigin = 'anonymous';
      (a as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      document.body.appendChild(a);
      return a;
    };
    this.elements = [make(), make()];
    this.decks = [new Deck('A', this.ctx, this.elements[0], this.master), new Deck('B', this.ctx, this.elements[1], this.master)];
  }

  private log(line: string) {
    this.opts.log?.(line);
  }

  /** Call from a tap: iOS lets audio start only inside a user gesture. */
  async start(): Promise<void> {
    await this.ctx.resume();
    // bless both elements for later play() calls made by the decks' timers
    const blessKey = this.timeline?.items[0]?.key ?? this.library[0]?.key;
    for (const el of this.elements) {
      if (!blessKey) break;
      el.src = fileUrl(blessKey);
      void el.play().then(() => el.pause()).catch(() => {});
    }
    this.startedAt = performance.now();
    this.lastTick = performance.now();
    if (this.opts.replay) {
      this.timers.push(setInterval(() => this.tick(), TICK_MS));
      return;
    }
    void this.refreshProgram();
    for (let i = 0; i < 4; i++) setTimeout(() => void this.ping(), i * 300);
    const schedulePing = () => {
      const slow = performance.now() - this.startedAt > SLOW_PING_AFTER_MS;
      const t = setTimeout(() => {
        void this.ping();
        schedulePing();
      }, slow ? SLOW_PING_INTERVAL_MS : PING_INTERVAL_MS);
      this.timeouts.push(t);
      if (this.timeouts.length > 4) this.timeouts.shift();
    };
    schedulePing();
    this.timers.push(setInterval(() => void this.refreshLibrary(), LIBRARY_REFRESH_MS));
    this.timers.push(setInterval(() => this.tick(), TICK_MS));
    this.timers.push(setInterval(() => void this.refresh(), REFRESH_MS));
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    for (const t of this.timeouts) clearTimeout(t);
    this.timers = [];
    this.timeouts = [];
    for (const el of this.elements) {
      el.pause();
      el.removeAttribute('src');
      el.remove();
    }
    void this.loopDecks?.then((ds) => ds.forEach((d) => d.stop())).catch(() => {});
    void this.ctx.close();
  }

  /** The listener's own volume, 0 to 1 (not part of the shared mix). */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyOut();
  }

  /** Lowers the radio under something else (a video): 1 = full, 0.2 = ducked. */
  setDuck(level: number): void {
    this.duck = Math.min(1, Math.max(0, level));
    this.applyOut();
  }

  /** Lowers the music (not the voices) while someone on air talks: 1 = full. */
  setVoiceDuck(level: number): void {
    this.voiceDuck = Math.min(1, Math.max(0, level));
    this.applyMusic();
  }

  private applyMusic(): void {
    if (this.stopped) return;
    const target = this.paused ? 0 : this.voiceDuck;
    if (Math.abs(target - this.musicLevel) < 0.001) return;
    // quick down when someone starts talking, slower back up (BitChord's 0.08 s style ramps)
    const tc = target < this.musicLevel ? 0.06 : this.paused ? 0.3 : 0.35;
    this.musicLevel = target;
    this.music.gain.setTargetAtTime(target, this.ctx.currentTime, tc);
  }

  private setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.log(paused ? 'music paused by the host' : 'music back on');
    this.applyMusic();
  }

  private applyOut(): void {
    if (this.stopped) return;
    // linear, like the <audio> volume the site used before
    const target = this.volume * this.duck;
    this.out.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  private async refreshLibrary(): Promise<void> {
    try {
      this.library = await loadLibrary();
    } catch (e) {
      this.log(`couldn't fetch the library: ${String(e)}`);
    }
  }

  // ---- Clock ----------------------------------------------------------------------------

  private synced(): boolean {
    return this.opts.replay ? true : this.clock.synced;
  }

  serverNow(): number {
    return this.opts.replay ? this.opts.replay.clock(performance.now()) : this.clock.serverNowMs()!;
  }

  private pings = 0;

  private async ping(): Promise<void> {
    const sentAt = this.clock.nowMs();
    // the first count goes with the 5th ping (after the four quick ones), then every 5th
    const count = this.opts.listenerId && ++this.pings % COUNT_EVERY_PINGS === 0;
    try {
      const id = count ? `&l=${encodeURIComponent(this.opts.listenerId!)}` : '';
      const r = await fetch(`${TIME_URL}?c=${Math.round(sentAt)}${id}`, { cache: 'no-store' });
      const received = this.clock.nowMs();
      const body = (await r.json()) as { serverMs: number; listeners?: number | null };
      if (typeof body.listeners === 'number') this.listeners = body.listeners;
      // a counting ping waits on the database after the server read its clock, so its round trip says
      // nothing true about the network: it isn't used for the clock
      if (count || !Number.isFinite(body.serverMs)) return;
      this.clock.record(sentAt, body.serverMs, received);
    } catch (e) {
      this.log(`ping failed: ${String(e)}`);
    }
  }

  /**
   * Server ms -> AudioContext time at which that instant is *heard*:
   * getOutputTimestamp pairs the sample at the speaker with performance
   * time, so output latency is in it. A median of recent readings rides
   * out its jitter.
   */
  private ctxBase(): number | null {
    const replay = this.opts.replay;
    const offset = this.clock.offsetMs;
    if (offset === null && !replay) return null;
    const ts = this.ctx.getOutputTimestamp?.();
    let base: number;
    if (ts && ts.contextTime && ts.performanceTime) {
      const serverAt = replay ? replay.clock(ts.performanceTime) : performance.timeOrigin + ts.performanceTime + this.skewMs + offset!;
      base = ts.contextTime - serverAt / 1000;
    } else {
      const serverNow = this.serverNow();
      const latency = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency || this.ctx.baseLatency || 0;
      base = this.ctx.currentTime - latency - serverNow / 1000;
    }
    this.mapping.push(base);
    if (this.mapping.length > 15) this.mapping.shift();
    const sorted = [...this.mapping].sort((a, b) => a - b);
    return sorted[sorted.length >> 1]!;
  }

  /**
   * Whether the mapping has settled: a full window whose middle half agrees
   * to 2 ms. Right after the context starts, its output timestamps wander by
   * tens of ms; a loop mix put on the clock then can't be moved later (that
   * would click), so a late listener waits for this before joining one.
   */
  private mappingSettled(): boolean {
    if (this.mapping.length < 15) return false;
    const sorted = [...this.mapping].sort((a, b) => a - b);
    return sorted[11]! - sorted[3]! < 0.002;
  }

  // ---- The running order ------------------------------------------------------------------

  private adopt(tl: RadioTimeline | null): void {
    if (tl && (!this.timeline || tl.rev > this.timeline.rev)) {
      this.timeline = tl;
      this.log(`running order rev ${tl.rev}: ${tl.items.map((i) => i.title).join(' → ')}`);
    }
  }

  private async refresh(): Promise<void> {
    void this.refreshProgram();
    try {
      this.adopt(await fetchTimeline());
    } catch (e) {
      this.log(`couldn't fetch the running order: ${String(e)}`);
    }
  }

  private async refreshProgram(): Promise<void> {
    try {
      this.program = await fetchProgram();
      this.setPaused(!!this.program?.studio && this.program.studio.pausedAt !== null);
    } catch (e) {
      this.log(`couldn't fetch the program: ${String(e)}`);
    }
  }

  /** The AutoDJ's part: line up a song (or start the radio) when this running order needs it. */
  private async work(): Promise<void> {
    if (this.working || this.opts.autodj === false || this.opts.replay || this.paused || !this.library.length || !this.clock.synced || performance.now() < this.nextWorkAt) return;
    if (!needsWork(this.timeline, this.clock.serverNowMs()!)) return;
    this.working = true;
    try {
      // a short random wait, then a fresh look: listeners don't all do the same work at once
      // (a fresh start waits less: someone pressed Listen and nothing is playing yet)
      const fresh = !this.timeline || endOfTimelineMs(this.timeline) < this.clock.serverNowMs()! + 5_000;
      await new Promise((r) => setTimeout(r, Math.random() * (fresh ? 400 : 4000)));
      await this.refresh();
      if (!needsWork(this.timeline, this.clock.serverNowMs()!)) return;
      this.workNote = this.timeline ? 'lining up the next song' : 'starting the radio';
      const stored = await extend(
        this.timeline,
        this.library,
        this.program,
        () => this.clock.serverNowMs()!,
        async (tl) => {
          const r = await fetch(AUTODJ_WRITE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeline: tl }) });
          return r.ok ? { ok: true } : { ok: false, error: `${r.status} ${await r.text()}` };
        },
        (line) => this.log(line),
      );
      if (stored) this.adopt(stored);
      else {
        // refused or impossible: look again, and don't try again straight away
        this.nextWorkAt = performance.now() + 15_000;
        await this.refresh();
      }
    } catch (e) {
      this.nextWorkAt = performance.now() + 15_000;
      this.log(`AutoDJ step failed: ${String(e)}`);
    } finally {
      this.working = false;
      this.workNote = null;
    }
  }

  // ---- The loop ---------------------------------------------------------------------------

  private tick(): void {
    const nowPerf = performance.now();
    this.maxTickGapMs = Math.max(this.maxTickGapMs, nowPerf - this.lastTick);
    this.lastTick = nowPerf;
    if (!this.synced()) {
      this.status = { state: 'syncing clock' };
      return;
    }
    const base = this.ctxBase();
    if (base === null) return;
    const ctxAt = (serverMs: number) => base + serverMs / 1000;
    const serverNow = this.serverNow();
    void this.work();
    const replay = this.opts.replay;
    if (replay) this.setPaused(replay.pauses.some((p) => p.start <= serverNow && p.end > serverNow));
    const tl = replay ? replayTimelineAt(replay.timelines, serverNow) : this.timeline;
    this.playing = tl;
    if (replay && !tl) {
      this.status = { state: 'between songs' };
      return;
    }
    if (!tl || (!this.library.length && endOfTimelineMs(tl) < serverNow)) {
      this.status = { state: this.library.length ? (this.workNote ?? 'starting the radio') : 'off air' };
      return;
    }
    const k = slotIndexAt(tl, serverNow);
    if (k === null) {
      this.status = { state: this.workNote ?? 'starting the radio', startsInSec: (tl.anchorMs - serverNow) / 1000 };
      return;
    }
    // the songs sounding now or within the horizon: at most two, on alternate decks
    for (const kk of [k - 1, k, k + 1]) {
      const slot = slotAt(tl, kk);
      if (!slot) continue;
      if (slot.endMs < serverNow - 500 || slot.startMs > serverNow + HORIZON_MS) continue;
      this.hold(kk % 2 === 0 ? 0 : 1, slot, ctxAt, serverNow);
    }
    // a loop mix coming up or under way
    for (const kk of [k - 1, k]) {
      const slot = slotAt(tl, kk);
      const out = slot?.mixOut;
      if (this.loopHeld && this.loopHeld.k !== kk && this.loopHeld.scheduledFor !== null) continue;
      if (!slot || !out || out.mix.style !== 'loop') continue;
      const end = out.t0Ms + out.mix.settleSec * 1000;
      if (serverNow > out.t0Ms - HORIZON_MS && serverNow < end + 500) void this.holdLoop(slot, ctxAt, serverNow);
    }
    if (this.loopHeld && this.loopHeld.scheduledFor !== null) {
      const slot = slotAt(tl, this.loopHeld.k);
      if (!slot) this.loopHeld = null;
      else if (slot.mixOut && serverNow > slot.mixOut.t0Ms + slot.mixOut.mix.settleSec * 1000 + 500) {
        void this.loopDecks?.then((ds) => ds.forEach((d) => d.stop()));
        this.loopHeld = null;
      }
    }

    const np = nowPlaying(tl, serverNow)!;
    if (np.slot.k !== this.lastSlotK) {
      this.lastSlotK = np.slot.k;
      this.onNowPlaying(np.slot);
    }
    const next = np.slot.mixOut;
    this.status = {
      state: 'playing',
      offsetMs: this.clock.offsetMs,
      roundTripMs: this.clock.roundTripMs,
      song: `${np.slot.item.title} (${np.slot.item.artist})`,
      slot: np.slot.k,
      positionSec: np.positionSec,
      nextMix: next ? { style: next.mix.style, inSec: (next.t0Ms - serverNow) / 1000, hash: next.mix.hash, reason: next.mix.reason } : null,
      loudnessGainDb: np.slot.item.loudnessDb === null ? null : 20 * Math.log10(loudnessGain(np.slot.item.loudnessDb)),
      outputLatencyMs: Math.round((((this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0) + this.ctx.baseLatency) * 1000),
      ctxState: this.ctx.state,
      mappingSettled: this.mappingSettled(),
      songsLinedUp: tl.firstK + tl.items.length - 1 - np.slot.k,
      autodj: this.workNote,
      rev: tl.rev,
      maxTickGapMs: Math.round(this.maxTickGapMs),
    };
  }

  /** Puts deck [d] on song slot [slot]: its element timeline and its automation. */
  private hold(d: 0 | 1, slot: Slot, ctxAt: (ms: number) => number, serverNow: number): void {
    const held = this.held[d];
    const deck = this.decks[d];
    const sig = [slot.mixIn?.mix.hash, slot.mixIn && Math.round(slot.mixIn.t0Ms), slot.mixOut?.mix.hash, slot.mixOut && Math.round(slot.mixOut.t0Ms)].join('|');
    if (held && held.k === slot.k && held.sig === sig) {
      // the same song: only re-put it on the clock if the mapping has moved
      if (Math.abs(ctxAt(held.refServerMs) - held.refCtx) < RETIME_SEC) return;
      deck.follow(this.elementPoints(slot, ctxAt));
      held.refCtx = ctxAt(held.refServerMs);
      return;
    }
    const el = this.elements[d];
    const url = fileUrl(slot.item.key);
    if (!el.src.endsWith(url)) {
      // a new song: start from rest (a song getting a mix added keeps its element going)
      el.src = url;
      el.load();
    }
    deck.fader.gain.setValueAtTime(loudnessGain(slot.item.loudnessDb), this.ctx.currentTime);
    deck.follow(this.elementPoints(slot, ctxAt));
    // automation: the mix that brings it in, then the one that takes it out
    const ops = this.paramOps(slot, 'el', ctxAt);
    const now = this.ctx.currentTime + 0.05;
    for (const [param, rest] of Object.entries(PARAM_REST) as [ParamId, number][]) {
      replayParam(elementParam(deck, param), ops.get(param) ?? [], rest, now);
    }
    this.held[d] = { k: slot.k, sig, key: slot.item.key, refServerMs: serverNow, refCtx: ctxAt(serverNow) };
    this.log(`deck ${deck.id}: ${slot.item.title} (slot ${slot.k})`);
  }

  private elementPoints(slot: Slot, ctxAt: (ms: number) => number): TimelinePoint[] {
    const points: TimelinePoint[] = [];
    if (slot.mixIn) {
      const t0 = ctxAt(slot.mixIn.t0Ms);
      for (const p of slot.mixIn.mix.program.transport) if (p.deck === 'inEl') points.push({ ...p, output: t0 + p.output });
    } else {
      points.push({ output: ctxAt(slot.startMs), input: slot.soloFromSec, rate: 1, active: true });
    }
    if (slot.mixOut) {
      const t0 = ctxAt(slot.mixOut.t0Ms);
      for (const p of slot.mixOut.mix.program.transport) if (p.deck === 'outEl') points.push({ ...p, output: t0 + p.output });
    } else {
      points.push({ output: ctxAt(slot.endMs), input: slot.item.durationSec, rate: 1, active: false });
    }
    return points;
  }

  private paramOps(slot: Slot, kind: 'el' | 'loop', ctxAt: (ms: number) => number, only?: 'in' | 'out'): Map<ParamId, AbsOp[]> {
    const ops = new Map<ParamId, AbsOp[]>();
    const add = (mix: TimelineMix, t0Ms: number, deck: DeckId) => {
      const t0 = ctxAt(t0Ms);
      for (const p of mix.program.params) {
        if (p.deck !== deck) continue;
        const list = ops.get(p.param) ?? [];
        list.push(shiftOp(p.e, t0));
        ops.set(p.param, list);
      }
    };
    if (kind === 'el') {
      if (slot.mixIn) add(slot.mixIn.mix, slot.mixIn.t0Ms, 'inEl');
      if (slot.mixOut) add(slot.mixOut.mix, slot.mixOut.t0Ms, 'outEl');
    } else if (slot.mixOut) {
      add(slot.mixOut.mix, slot.mixOut.t0Ms, only === 'in' ? 'inLoop' : 'outLoop');
    }
    return ops;
  }

  /** Readies the stretch decks for the loop mix out of [slot], then puts it on the clock. */
  private async holdLoop(slot: Slot, ctxAt: (ms: number) => number, serverNow: number): Promise<void> {
    const out = slot.mixOut!;
    if (this.loopHeld?.k !== slot.k) this.loopHeld = { k: slot.k, ready: false, preparing: false, scheduledFor: null };
    const held = this.loopHeld;
    if (!held.ready) {
      if (held.preparing) return;
      held.preparing = true;
      try {
        if (!this.loopDecks) {
          this.loopLoudness = [new GainNode(this.ctx), new GainNode(this.ctx)];
          for (const g of this.loopLoudness) g.connect(this.master);
          const [a, b] = this.loopLoudness;
          this.loopDecks = Promise.all([LoopDeck.create(this.ctx, a), LoopDeck.create(this.ctx, b)]);
        }
        const [outDeck, inDeck] = await this.loopDecks;
        const nextSlot = slotAt(this.playing!, slot.k + 1)!;
        const [outBuf, inBuf] = await Promise.all([
          songBytes(slot.item.key).then((b) => this.ctx.decodeAudioData(b.slice(0))),
          songBytes(nextSlot.item.key).then((b) => this.ctx.decodeAudioData(b.slice(0))),
        ]);
        for (const r of out.mix.program.regions) {
          const deck = r.deck === 'outLoop' ? outDeck : inDeck;
          await deck.load(r.side === 'out' ? slot.item.key : nextSlot.item.key, r.side === 'out' ? outBuf : inBuf, r.startSec, r.endSec);
        }
        this.loopLoudness![0].gain.value = loudnessGain(slot.item.loudnessDb);
        this.loopLoudness![1].gain.value = loudnessGain(nextSlot.item.loudnessDb);
        if (this.loopHeld !== held) return;
        held.ready = true;
        this.log(`loop decks ready for mix ${slot.k}`);
      } catch (e) {
        this.log(`loop mix not prepared: ${String(e)}`);
        return;
      } finally {
        held.preparing = false;
      }
    }
    const t0 = ctxAt(out.t0Ms);
    // put on the clock once; re-timed only while it's still ahead (a reschedule mid-mix would click)
    if (held.scheduledFor !== null && (Math.abs(held.scheduledFor - t0) < RETIME_SEC || this.ctx.currentTime > held.scheduledFor - 1)) return;
    // schedule once it's near (the decks post changes 0.25 s ahead), or at once when joining mid-mix
    if (out.t0Ms - serverNow > 8000 || !this.mappingSettled()) return;
    const [outDeck, inDeck] = await this.loopDecks!;
    const now = this.ctx.currentTime + 0.1;
    for (const [deck, id] of [
      [outDeck, 'outLoop'],
      [inDeck, 'inLoop'],
    ] as const) {
      deck.stop();
      const changes = out.mix.program.loops
        .filter((c) => c.deck === id)
        .map(({ deck: _d, ...c }) => ({ ...c, output: c.output + t0 }));
      deck.schedule(loopChangesFrom(changes, now));
      const ops = this.paramOps(slot, 'loop', ctxAt, id === 'inLoop' ? 'in' : 'out');
      for (const [param, rest] of Object.entries(PARAM_REST) as [ParamId, number][]) {
        replayParam(loopParam(deck, param), ops.get(param) ?? [], param === 'gain' ? LOOP_GAIN_REST : rest, now);
      }
    }
    held.scheduledFor = t0;
    this.log(`loop mix ${slot.k} on the clock (${((out.t0Ms - serverNow) / 1000).toFixed(1)} s ahead)`);
  }

  // ---- Now playing (lock screen) -----------------------------------------------------------

  private onNowPlaying(slot: Slot): void {
    this.log(`now playing: ${slot.item.title}`);
    this.opts.onSong?.(slot.item);
  }

  // ---- Measuring (test harness) ---------------------------------------------------------------

  /** The true wall clock (no test skew), for comparing two browsers on one machine. */
  static trueNowMs(): number {
    return performance.timeOrigin + performance.now();
  }

  private recorders = new Map<string, Promise<AudioWorkletNode>>();
  private workletLoaded: Promise<void> | null = null;

  /**
   * Records [seconds] of what this page outputs, starting near true wall
   * time [trueStartMs]; returns mono PCM and the true wall ms its first
   * sample is heard at (via getOutputTimestamp).
   */
  async capture(
    trueStartMs: number,
    seconds: number,
    source: 'master' | 'outLoop' | 'inLoop' = 'master',
  ): Promise<{ sampleRate: number; firstSampleTrueMs: number; pcm: number[] }> {
    if (!this.recorders.has(source)) this.recorders.set(source, (async () => {
      const code = `class Rec extends AudioWorkletProcessor{constructor(){super();this.on=false;this.left=0;this.port.onmessage=(e)=>{this.on=true;this.left=e.data;this.sent=false}}process(inputs){const i=inputs[0];if(this.on&&i&&i[0]){const n=i[0].length;const m=new Float32Array(n);for(let c=0;c<i.length;c++){const ch=i[c];for(let s=0;s<n;s++)m[s]+=ch[s]/i.length}this.port.postMessage({t:currentTime,pcm:m},[m.buffer]);this.left-=n;if(this.left<=0)this.on=false}return true}}registerProcessor('rec',Rec)`;
      this.workletLoaded ??= this.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      await this.workletLoaded;
      const node = new AudioWorkletNode(this.ctx, 'rec', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
      const from = source === 'master' ? this.master : this.loopLoudness?.[source === 'outLoop' ? 0 : 1];
      if (!from) throw new Error(`nothing to record at ${source}`);
      from.connect(node);
      return node;
    })());
    const node = await this.recorders.get(source)!;
    const wait = trueStartMs - RadioEngine.trueNowMs();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const sr = this.ctx.sampleRate;
    const total = Math.round(seconds * sr);
    const chunks: { t: number; pcm: Float32Array }[] = [];
    let got = 0;
    await new Promise<void>((resolve) => {
      node.port.onmessage = (e: MessageEvent<{ t: number; pcm: Float32Array }>) => {
        chunks.push(e.data);
        got += e.data.pcm.length;
        if (got >= total) resolve();
      };
      node.port.postMessage(total);
    });
    const firstCtx = chunks[0]!.t;
    const ts = this.ctx.getOutputTimestamp();
    // the sample rendered at context time C is heard at performanceTime + (C - contextTime)
    const firstSampleTrueMs = performance.timeOrigin + ts.performanceTime! + (firstCtx - ts.contextTime!) * 1000;
    const pcm = new Float32Array(got);
    let at = 0;
    for (const c of chunks) {
      pcm.set(c.pcm, at);
      at += c.pcm.length;
    }
    return { sampleRate: sr, firstSampleTrueMs, pcm: Array.from(pcm.subarray(0, total)) };
  }
}

function elementParam(deck: Deck, param: ParamId): AudioParam {
  const eq = deck.eq as unknown as { input: BiquadFilterNode; mid: BiquadFilterNode; output: BiquadFilterNode };
  switch (param) {
    case 'gain':
      return deck.gain.gain;
    case 'low':
      return eq.input.gain;
    case 'mid':
      return eq.mid.gain;
    case 'high':
      return eq.output.gain;
    case 'hp':
      return deck.sweep.highpass.frequency;
    case 'lp':
      return deck.sweep.lowpass.frequency;
  }
}

function loopParam(deck: LoopDeck, param: ParamId): AudioParam {
  const eq = deck.eq as unknown as { input: BiquadFilterNode; mid: BiquadFilterNode; output: BiquadFilterNode };
  switch (param) {
    case 'gain':
      return deck.gain.gain;
    case 'low':
      return eq.input.gain;
    case 'mid':
      return eq.mid.gain;
    case 'high':
      return eq.output.gain;
    case 'hp':
      return deck.sweep.highpass.frequency;
    case 'lp':
      return deck.sweep.lowpass.frequency;
  }
}

/** The running order that was playing at [ms] in a replay: the latest revision that covers it. */
function replayTimelineAt(list: RadioTimeline[], ms: number): RadioTimeline | null {
  let best: RadioTimeline | null = null;
  for (const tl of list) {
    if (slotIndexAt(tl, ms) === null || endOfTimelineMs(tl) <= ms) continue;
    if (!best || tl.rev > best.rev) best = tl;
  }
  return best;
}
