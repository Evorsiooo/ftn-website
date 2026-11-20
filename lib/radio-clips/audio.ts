// The sound of a stretch of a show, rebuilt in the browser from its replay: each person's recorded
// voice where it was said, and the songs that played, where they played. Also works out who is
// talking when (for the green rings) from the voices themselves.
//
// The songs are placed from the replay's running orders with the same arithmetic the radio uses
// (lib/radio/autodj.ts). A mix between two songs is rebuilt as a plain crossfade over the same
// seconds; the Automix effects (EQ, loops, tempo) are left out.
import { ALL_FORMATS, AudioBufferSink, BufferSource, Input } from "mediabunny";
import { endOfTimelineMs, slotAt, slotIndexAt, trackPositionSec, type RadioTimeline, type Slot } from "@/lib/radio/autodj";
import type { ClipShow } from "./model";

export const SAMPLE_RATE = 48_000;
/** Music level while someone talks (the radio's TALK_DUCK). */
const TALK_DUCK = 0.3;
/** Talk detection, as the radio's TalkDetector: loud = RMS over 0.02 in a ~21 ms window, held 700 ms. */
const TALK_THRESHOLD = 0.02;
const TALK_WINDOW = 1024;
export const TALK_HOLD_MS = 700;
const DUCK_RAMP = 0.15;
const RADIO_FILES = "https://radio-files.euno.cc";

export const radioFileUrl = (key: string) => `${RADIO_FILES}/${key.split("/").map(encodeURIComponent).join("/")}`;

/** BitChord's loudness gain (radio-engine/src/radio/loudness.ts). */
function loudnessGain(loudnessDb: number | null): number {
  if (loudnessDb === null) return 1;
  const mb = Math.min(300, Math.max(-1500, Math.round(-loudnessDb * 100)));
  return Math.pow(10, mb / 2000);
}

// ------------------------------------------------------------------------------------------- loading

const decoder = () => new OfflineAudioContext(1, 1, SAMPLE_RATE);

function cached<T>(map: Map<string, Promise<T>>, key: string, max: number, load: () => Promise<T>): Promise<T> {
  let p = map.get(key);
  if (!p) {
    p = load();
    p.catch(() => map.delete(key));
    map.set(key, p);
    while (map.size > max) map.delete(map.keys().next().value!);
  }
  return p;
}

const timelineCache = new Map<string, Promise<RadioTimeline | null>>();
export function loadTimelines(show: ClipShow): Promise<RadioTimeline[]> {
  return Promise.all(
    show.timelines.map((k) =>
      cached(timelineCache, k, 200, () =>
        fetch(radioFileUrl(k))
          .then((r) => (r.ok ? (r.json() as Promise<RadioTimeline>) : null))
          .catch(() => null)
      )
    )
  ).then((l) => l.filter((t): t is RadioTimeline => !!t));
}

const voiceCache = new Map<string, Promise<AudioBuffer>>();
/** One recorded piece of someone's voice (about a minute), decoded at 48 kHz. */
export function loadVoice(key: string): Promise<AudioBuffer> {
  return cached(voiceCache, key, 400, async () => {
    const res = await fetch(radioFileUrl(key));
    if (!res.ok) throw new Error(`A voice recording is missing (${res.status}).`);
    return decoder().decodeAudioData(await res.arrayBuffer());
  });
}

const songCache = new Map<string, Promise<ArrayBuffer>>();
const songBytes = (key: string) =>
  cached(songCache, key, 6, async () => {
    const res = await fetch(radioFileUrl(key));
    if (!res.ok) throw new Error(`A song file is missing (${res.status}).`);
    return res.arrayBuffer();
  });

// ------------------------------------------------------------------------------------------- talking

const talkCache = new Map<string, Promise<[number, number][]>>();
/** When a voice piece is loud, as [start, end] server ms (end includes the hold). */
export function voiceTalk(v: { key: string; start: number }): Promise<[number, number][]> {
  return cached(talkCache, v.key, 2000, async () => {
    const buf = await loadVoice(v.key);
    const data = buf.getChannelData(0);
    const out: [number, number][] = [];
    const winMs = (TALK_WINDOW / buf.sampleRate) * 1000;
    for (let i = 0; i + TALK_WINDOW <= data.length; i += TALK_WINDOW) {
      let sum = 0;
      for (let j = i; j < i + TALK_WINDOW; j++) sum += data[j]! * data[j]!;
      if (Math.sqrt(sum / TALK_WINDOW) <= TALK_THRESHOLD) continue;
      const a = v.start + (i / buf.sampleRate) * 1000;
      const b = a + winMs + TALK_HOLD_MS;
      const last = out[out.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    return out;
  });
}

/** Talking spans per person (userId) between a and b. */
export async function talkIn(show: ClipShow, a: number, b: number): Promise<Map<string, [number, number][]>> {
  const map = new Map<string, [number, number][]>();
  const pieces = show.voices.filter((v) => v.userId && v.end > a && v.start < b);
  const spans = await Promise.all(pieces.map((v) => voiceTalk(v).catch(() => [] as [number, number][])));
  pieces.forEach((v, i) => {
    const list = map.get(v.userId!) ?? [];
    for (const s of spans[i]!) if (s[1] > a && s[0] < b) list.push(s);
    map.set(v.userId!, list);
  });
  for (const list of map.values()) list.sort((x, y) => x[0] - y[0]);
  return map;
}

/** Merges overlapping spans. */
export function union(spans: [number, number][]): [number, number][] {
  const sorted = [...spans].sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out;
}

// ------------------------------------------------------------------------------------------- songs

/** The running order that was playing at ms: the latest revision that covers it (as the engine). */
function timelineAt(list: RadioTimeline[], ms: number): RadioTimeline | null {
  let best: RadioTimeline | null = null;
  for (const tl of list) {
    if (slotIndexAt(tl, ms) === null || endOfTimelineMs(tl) <= ms) continue;
    if (!best || tl.rev > best.rev) best = tl;
  }
  return best;
}

export interface SongSpan {
  slot: Slot;
  /** Server ms the song is heard from and to (including its mixes in and out). */
  start: number;
  end: number;
  title: string;
  artist: string;
}

/** Every song heard between a and b, in order. */
export function songsIn(timelines: RadioTimeline[], a: number, b: number): SongSpan[] {
  const found = new Map<number, Slot>();
  const step = 5_000;
  for (let t = a; t <= b + step; t += step) {
    const ms = Math.min(t, b);
    const tl = timelineAt(timelines, ms);
    if (!tl) continue;
    const k = slotIndexAt(tl, ms);
    if (k === null) continue;
    for (const kk of [k - 1, k, k + 1]) {
      if (found.has(kk)) continue;
      const s = slotAt(tl, kk);
      if (s && s.endMs > a && s.startMs < b) found.set(kk, s);
    }
  }
  return [...found.values()]
    .sort((x, y) => x.startMs - y.startMs)
    .map((slot) => ({ slot, start: slot.startMs, end: slot.endMs, title: slot.item.title, artist: slot.item.artist }));
}

// ------------------------------------------------------------------------------------------- mixing

export interface ClipAudio {
  buffer: AudioBuffer;
  /** Loudness of the clip in [bars] equal parts, 0 to 1. */
  peaks: number[];
}

/**
 * Renders the show between a and b (server ms) to a stereo buffer: the voices, and the songs
 * (ducked under the voices, silent during pauses) when `music` is on.
 */
export async function renderClipAudio(
  show: ClipShow,
  a: number,
  b: number,
  music: boolean,
  opts: { bars?: number; signal?: AbortSignal; sampleRate?: number; channels?: number } = {}
): Promise<ClipAudio> {
  const { bars = 132, signal, sampleRate = SAMPLE_RATE, channels = 2 } = opts;
  const seconds = (b - a) / 1000;
  const ctx = new OfflineAudioContext(channels, Math.ceil(seconds * sampleRate), sampleRate);
  const at = (ms: number) => Math.max(0, (ms - a) / 1000);
  const aborted = () => {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  };

  // voices, as recorded
  const pieces = show.voices.filter((v) => v.end > a && v.start < b);
  const buffers = await Promise.all(pieces.map((v) => loadVoice(v.key).catch(() => null)));
  aborted();
  pieces.forEach((v, i) => {
    const buf = buffers[i];
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const offset = Math.max(0, (a - v.start) / 1000);
    if (offset >= buf.duration) return;
    src.start(at(v.start), offset, Math.min(buf.duration - offset, seconds));
  });

  if (music) {
    const bus = ctx.createGain();
    bus.connect(ctx.destination);
    // ducking under whoever talks, and silence while the host had paused the music
    const talk = union([...(await talkIn(show, a, b)).values()].flat());
    aborted();
    const g = bus.gain;
    g.setValueAtTime(1, 0);
    const level = (ms: number) => (show.pauses.some((p) => p.start <= ms && p.end > ms) ? 0 : talk.some((s) => s[0] <= ms && s[1] > ms) ? TALK_DUCK : 1);
    const edges = [a, ...talk.flat(), ...show.pauses.flatMap((p) => [p.start, p.end])].filter((ms) => ms >= a && ms < b).sort((x, y) => x - y);
    let last = level(a);
    g.setValueAtTime(last, 0);
    for (const ms of edges) {
      const want = level(ms + 1);
      if (want === last) continue;
      g.setValueAtTime(last, at(ms));
      g.linearRampToValueAtTime(want, at(ms) + DUCK_RAMP);
      last = want;
    }

    const timelines = await loadTimelines(show);
    for (const song of songsIn(timelines, a, b)) {
      aborted();
      const from = Math.max(a, song.start);
      const to = Math.min(b, song.end);
      if (to - from < 20) continue;
      const pos = Math.max(0, trackPositionSec(song.slot, from));
      const length = (to - from) / 1000;
      let bytes: ArrayBuffer;
      try {
        bytes = await songBytes(song.slot.item.key);
      } catch {
        continue;
      }
      const gain = ctx.createGain();
      gain.connect(bus);
      // fades: in over the mix into it, out over the mix out of it
      const base = loudnessGain(song.slot.item.loudnessDb);
      const env = (ms: number) => {
        let v = 1;
        const s = song.slot;
        if (s.mixIn && ms < s.soloFromMs) v = Math.min(v, (ms - s.startMs) / Math.max(1, s.soloFromMs - s.startMs));
        if (s.mixOut && ms > s.mixOut.t0Ms) v = Math.min(v, (s.endMs - ms) / Math.max(1, s.endMs - s.mixOut.t0Ms));
        return base * Math.max(0, Math.min(1, v));
      };
      gain.gain.setValueAtTime(env(from), at(from));
      for (const ms of [song.slot.soloFromMs, song.slot.mixOut?.t0Ms, to]) {
        if (ms !== undefined && ms > from && ms <= to) gain.gain.linearRampToValueAtTime(env(ms), at(ms));
      }
      const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
      const track = await input.getPrimaryAudioTrack();
      if (!track) continue;
      const sink = new AudioBufferSink(track);
      for await (const { buffer, timestamp, duration } of sink.buffers(pos, pos + length)) {
        aborted();
        const skip = Math.max(0, pos - timestamp);
        const usable = Math.min(duration - skip, pos + length - Math.max(timestamp, pos));
        if (usable <= 0) continue;
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(gain);
        node.start(at(from) + Math.max(0, timestamp - pos), skip, usable);
      }
    }
  }

  const buffer = await ctx.startRendering();
  return { buffer, peaks: peaksOf(buffer, bars) };
}

/** Loudness of each of [bars] equal parts of the buffer, scaled so the loudest is 1. */
export function peaksOf(buffer: AudioBuffer, bars: number): number[] {
  const l = buffer.getChannelData(0);
  const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : l;
  const per = Math.max(1, Math.floor(l.length / bars));
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    let sum = 0;
    const from = i * per;
    const to = Math.min(l.length, from + per);
    for (let j = from; j < to; j += 4) sum += (l[j]! * l[j]! + r[j]! * r[j]!) / 2;
    out.push(Math.sqrt(sum / Math.max(1, (to - from) / 4)));
  }
  const max = Math.max(1e-4, ...out);
  return out.map((v) => Math.sqrt(v / max));
}
