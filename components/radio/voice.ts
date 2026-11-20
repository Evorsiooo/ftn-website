"use client";
// Voices on the radio (Studio shows): Cloudflare Realtime's SFU, reached only through
// /api/radio/rtc. One VoiceLink per browser: it can send this browser's microphone (someone on
// air) and receive the voices of the people on air (everyone listening). Once a minute it
// reports its track count for the monthly usage cap; past the cap the website says stop.

type Remote = { sessionId: string; trackName: string };

const ICE: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
/** Voice is sent at 48 kbps at most (the usage estimate assumes 64). */
const MAX_BITRATE = 48_000;
const BEAT_MS = 60_000;

async function rtc(body: Record<string, unknown>): Promise<any> {
  const r = await fetch("/api/radio/rtc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `voice: HTTP ${r.status}`);
  return d;
}

export class VoiceLink {
  readonly pc: RTCPeerConnection;
  private sessionId = "";
  private token = "";
  private beat: ReturnType<typeof setInterval> | undefined;
  /** key "session/track" -> the mid it arrived on. */
  private pulled = new Map<string, string>();
  private pushedMid: string | null = null;
  private waiting = new Map<string, (t: MediaStreamTrack) => void>();
  private closed = false;
  /** Called with each voice as it arrives (key "session/track"). */
  onTrack: (key: string, track: MediaStreamTrack) => void = () => {};
  /** The connection dropped (final false: worth a new one), or the usage cap was reached (final true). */
  onStop: (why: string, final: boolean) => void = () => {};

  private constructor() {
    this.pc = new RTCPeerConnection({ iceServers: ICE, bundlePolicy: "max-bundle" });
    this.pc.ontrack = (e) => {
      const mid = e.transceiver.mid;
      for (const [key, m] of this.pulled) {
        if (m !== mid) continue;
        this.onTrack(key, e.track);
        this.waiting.get(key)?.(e.track);
        this.waiting.delete(key);
      }
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed" && !this.closed) this.onStop("The voice connection dropped. Reconnecting…", false);
    };
  }

  static async open(): Promise<VoiceLink> {
    const link = new VoiceLink();
    const s = await rtc({ op: "session" });
    link.sessionId = s.sessionId;
    link.token = s.token;
    link.beat = setInterval(() => void link.report(), BEAT_MS);
    return link;
  }

  get session(): string {
    return this.sessionId;
  }

  private tracks(): number {
    return this.pulled.size + (this.pushedMid ? 1 : 0);
  }

  private async report(): Promise<void> {
    if (this.closed || !this.tracks()) return;
    try {
      const d = await rtc({ op: "beat", sessionId: this.sessionId, token: this.token, tracks: this.tracks() });
      if (d.stop) {
        this.close();
        this.onStop("Voice is off for the rest of the month: the usage cap was reached.", true);
      }
    } catch {
      /* the next one will do */
    }
  }

  /** Sends [track] (this browser's microphone); returns the track's name on the SFU. */
  async push(track: MediaStreamTrack): Promise<string> {
    const tr = this.pc.addTransceiver(track, { direction: "sendonly" });
    try {
      const p = tr.sender.getParameters();
      p.encodings = [{ ...(p.encodings?.[0] ?? {}), maxBitrate: MAX_BITRATE }];
      await tr.sender.setParameters(p);
    } catch {
      /* some browsers only take it after negotiation; the default Opus rate is close anyway */
    }
    await this.pc.setLocalDescription(await this.pc.createOffer());
    const trackName = `voice-${crypto.randomUUID().slice(0, 8)}`;
    const d = await rtc({ op: "push", sessionId: this.sessionId, token: this.token, offer: { type: "offer", sdp: this.pc.localDescription!.sdp }, tracks: [{ mid: tr.mid, trackName }] });
    await this.pc.setRemoteDescription(d.sessionDescription);
    this.pushedMid = tr.mid;
    void this.report();
    return trackName;
  }

  /** Receives the voices in [list] not received yet. */
  async pull(list: Remote[]): Promise<void> {
    const fresh = list.filter((t) => !this.pulled.has(`${t.sessionId}/${t.trackName}`));
    if (!fresh.length) return;
    const d = await rtc({ op: "pull", sessionId: this.sessionId, token: this.token, tracks: fresh });
    for (const t of d.tracks ?? []) {
      if (t.mid && t.trackName) this.pulled.set(`${t.sessionId}/${t.trackName}`, t.mid);
    }
    if (d.requiresImmediateRenegotiation && d.sessionDescription) {
      await this.pc.setRemoteDescription(d.sessionDescription);
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await rtc({ op: "renegotiate", sessionId: this.sessionId, token: this.token, answer: { type: "answer", sdp: this.pc.localDescription!.sdp } });
    }
    void this.report();
  }

  /** Stops receiving the voices not in [keep] (people who went off air). */
  async drop(keep: Set<string>): Promise<void> {
    const gone = [...this.pulled].filter(([key]) => !keep.has(key));
    if (!gone.length) return;
    gone.forEach(([key]) => this.pulled.delete(key));
    for (const tr of this.pc.getTransceivers()) if (gone.some(([, mid]) => mid === tr.mid)) tr.direction = "inactive";
    await rtc({ op: "close", sessionId: this.sessionId, token: this.token, mids: gone.map(([, mid]) => mid) }).catch(() => {});
  }

  has(key: string): boolean {
    return this.pulled.has(key);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.beat);
    this.pc.getSenders().forEach((s) => s.track?.stop());
    this.pc.close();
  }
}

// ---------------------------------------------------------------------------------- talking detection

/**
 * Watches voices and says when anyone is talking, so the music can be lowered (ducked) and
 * brought back up a moment after they stop.
 */
export class TalkDetector {
  private ctx: AudioContext;
  private nodes = new Map<string, { src: AudioNode; an: AnalyserNode }>();
  private timer: ReturnType<typeof setInterval>;
  private lastVoiceAt = 0;
  private talking = false;
  private buf = new Float32Array(1024);
  /** Per voice: when it was last loud (for the speaking rings). */
  private lastLoud = new Map<string, number>();
  private speakingKey = "";
  /** Called with the voices talking now (keys), whenever that changes. */
  onSpeakers: (keys: string[]) => void = () => {};

  constructor(private onChange: (talking: boolean) => void, private holdMs = 700, private threshold = 0.02) {
    this.ctx = new AudioContext();
    this.timer = setInterval(() => this.check(), 50);
  }

  add(key: string, stream: MediaStream): void {
    if (this.nodes.has(key)) return;
    void this.ctx.resume().catch(() => {});
    const src = this.ctx.createMediaStreamSource(stream);
    const an = this.ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    this.nodes.set(key, { src, an });
  }

  /** A recorded voice (replays): played through the detector, which hears it on the way. */
  addElement(key: string, el: HTMLMediaElement): void {
    if (this.nodes.has(key)) return;
    void this.ctx.resume().catch(() => {});
    const src = this.ctx.createMediaElementSource(el);
    const an = this.ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    src.connect(this.ctx.destination);
    this.nodes.set(key, { src, an });
  }

  remove(key: string): void {
    const n = this.nodes.get(key);
    if (!n) return;
    n.src.disconnect();
    this.nodes.delete(key);
  }

  keys(): string[] {
    return [...this.nodes.keys()];
  }

  private check(): void {
    let loud = false;
    const now = performance.now();
    for (const [key, { an }] of this.nodes) {
      an.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i]! * this.buf[i]!;
      if (Math.sqrt(sum / this.buf.length) > this.threshold) {
        loud = true;
        this.lastLoud.set(key, now);
      }
    }
    // a ring stays on through the short gaps between words
    const speakers = [...this.nodes.keys()].filter((k) => now - (this.lastLoud.get(k) ?? -1e9) < 350).sort();
    const sk = speakers.join(",");
    if (sk !== this.speakingKey) {
      this.speakingKey = sk;
      this.onSpeakers(speakers);
    }
    if (loud) this.lastVoiceAt = now;
    const talking = now - this.lastVoiceAt < this.holdMs;
    if (talking !== this.talking) {
      this.talking = talking;
      this.onChange(talking);
    }
  }

  close(): void {
    clearInterval(this.timer);
    this.nodes.forEach((n) => n.src.disconnect());
    this.nodes.clear();
    void this.ctx.close().catch(() => {});
  }
}

/** How low the music goes while someone on air talks. */
export const TALK_DUCK = 0.3;

// -------------------------------------------------------------------------------------------- recording

/**
 * Records this browser's microphone for the replay, a minute at a time; each piece is uploaded
 * on its own with the server time it starts at.
 */
export class VoiceRecorder {
  private rec: MediaRecorder | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private pieceStart = 0;

  constructor(private stream: MediaStream, private serverNow: () => number, private pieceMs = 60_000) {}

  start(): void {
    if (typeof MediaRecorder === "undefined") return;
    this.next();
  }

  private next(): void {
    if (this.stopped) return;
    const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(this.stream, type ? { mimeType: type, audioBitsPerSecond: 48_000 } : undefined);
    } catch {
      return;
    }
    const chunks: Blob[] = [];
    const start = this.serverNow();
    this.pieceStart = performance.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const dur = performance.now() - this.pieceStart;
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size) void fetch(`/api/radio/voice?start=${Math.round(start)}&dur=${Math.round(dur)}`, { method: "POST", headers: { "Content-Type": blob.type }, body: blob, keepalive: blob.size < 60_000 }).catch(() => {});
      this.next();
    };
    rec.start();
    this.rec = rec;
    this.timer = setTimeout(() => rec.state !== "inactive" && rec.stop(), this.pieceMs);
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
  }
}

/** Server ms minus this device's ms, from a few quick pings (good to tens of ms). */
export async function serverOffsetMs(): Promise<number> {
  let best = { rtt: Infinity, off: 0 };
  for (let i = 0; i < 4; i++) {
    const sent = Date.now();
    const r = await fetch(`/api/radio/time?c=${sent}`, { cache: "no-store" }).catch(() => null);
    const got = Date.now();
    const body = (await r?.json().catch(() => null)) as { serverMs?: number } | null;
    if (body?.serverMs && got - sent < best.rtt) best = { rtt: got - sent, off: body.serverMs - (sent + got) / 2 };
  }
  return best.off;
}

/** The microphone, set up for speech (echo cancelling on: hosts and callers hear the radio too). */
export function getMic(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
}

// ------------------------------------------------------------------------------------- levelling

/**
 * Evens out a voice before it goes on air, so a quiet microphone and a loud one come out about
 * as loud as each other for every listener (and in the replay). It's a slow automatic gain that
 * only adapts while the person is talking, aiming at a steady speech level (TARGET_DB), followed by
 * a compressor that catches shouts and sudden peaks. [gain] is an extra level on top (a host's
 * slider), 1 = as levelled.
 *
 * If the browser won't run audio processing (no click on the page yet), [track] is the plain
 * microphone, so the voice still goes out.
 */
export class VoiceLeveller {
  readonly track: MediaStreamTrack;
  readonly stream: MediaStream;
  private ctx: AudioContext | null = null;
  private auto: GainNode | null = null;
  private manual: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private src: MediaStreamAudioSourceNode | null = null;

  static TARGET_DB = -20;
  static MIN_GAIN = 0.35;
  static MAX_GAIN = 6;
  /** Below this the person isn't talking (room noise): the gain is left alone. */
  static GATE_DB = -50;

  private constructor(raw: MediaStreamTrack, ctx: AudioContext | null) {
    if (!ctx) {
      this.track = raw.clone();
      this.stream = new MediaStream([this.track]);
      return;
    }
    this.ctx = ctx;
    const src = ctx.createMediaStreamSource(new MediaStream([raw]));
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    const auto = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const manual = ctx.createGain();
    const out = ctx.createMediaStreamDestination();
    src.connect(an);
    src.connect(auto).connect(comp).connect(manual).connect(out);
    this.src = src;
    this.auto = auto;
    this.manual = manual;
    this.track = out.stream.getAudioTracks()[0]!;
    this.stream = out.stream;

    // the level of the last ~45 ms, every 50 ms; the gain moves a little toward the target while
    // there is speech (about 2 dB a second up, faster down so a loud voice is tamed quickly)
    const buf = new Float32Array(an.fftSize);
    let g = 1;
    this.timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
      const db = 10 * Math.log10(sum / buf.length + 1e-12);
      if (db < VoiceLeveller.GATE_DB) return;
      const want = Math.min(VoiceLeveller.MAX_GAIN, Math.max(VoiceLeveller.MIN_GAIN, 10 ** ((VoiceLeveller.TARGET_DB - db) / 20)));
      const step = want > g ? 1.012 : 0.96;
      g = want > g ? Math.min(want, g * step) : Math.max(want, g * step);
      auto.gain.setTargetAtTime(g, ctx.currentTime, 0.05);
    }, 50);
  }

  /** Levels [mic]'s first audio track. Falls back to the plain track if audio can't run here. */
  static async create(mic: MediaStream, gain = 1): Promise<VoiceLeveller> {
    const raw = mic.getAudioTracks()[0];
    if (!raw) throw new Error("No microphone.");
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      if (ctx.state !== "running") await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 800))]);
      if (ctx.state !== "running") {
        void ctx.close().catch(() => {});
        ctx = null;
      }
    } catch {
      ctx = null;
    }
    const l = new VoiceLeveller(raw, ctx);
    l.setGain(gain);
    return l;
  }

  /** Levelled: processing runs (false = the plain microphone goes out). */
  get levelled(): boolean {
    return !!this.ctx;
  }

  setGain(gain: number): void {
    if (!this.manual || !this.ctx) return;
    this.manual.gain.setTargetAtTime(Math.max(0, Math.min(3, gain)), this.ctx.currentTime, 0.05);
  }

  close(): void {
    clearInterval(this.timer);
    this.src?.disconnect();
    this.track.stop();
    void this.ctx?.close().catch(() => {});
  }
}
