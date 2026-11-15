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
  /** The usage cap was reached, or the connection failed for good. */
  onStop: (why: string) => void = () => {};

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
      if (this.pc.connectionState === "failed" && !this.closed) this.onStop("The voice connection dropped.");
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
        this.onStop("Voice is off for the rest of the month: the usage cap was reached.");
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
