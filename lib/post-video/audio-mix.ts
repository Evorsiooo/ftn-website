import { AudioBufferSink } from "mediabunny";
import { clipStarts, type Project } from "./model";
import type { LoadedSource } from "./sources";

const SAMPLE_RATE = 48000;
// Short ramps at the edge of every piece, so cuts do not click.
const EDGE = 0.008;

/** Whether the finished video needs a sound track at all. */
export function hasAudio(project: Project, sources: Map<string, LoadedSource>): boolean {
  const clipSound = project.clips.some((c) => c.volume > 0 && sources.get(c.sourceId)?.audioTrack);
  const music = project.music.some((m) => m.volume > 0 && sources.get(m.sourceId)?.audioTrack);
  return clipSound || music;
}

/**
 * Mixes the sound of every clip and every music piece into one stereo buffer, the length of
 * the video. Volume, fades and trimming are applied by the Web Audio graph.
 */
export async function mixAudio(
  project: Project,
  sources: Map<string, LoadedSource>,
  duration: number,
  signal?: AbortSignal
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);

  const place = async (
    source: LoadedSource,
    from: number,
    to: number,
    at: number,
    volume: number,
    fadeIn: number,
    fadeOut: number
  ) => {
    if (!source.audioTrack || volume <= 0 || at >= duration) return;
    const end = Math.min(to, from + (duration - at));
    const length = end - from;
    if (length <= 0) return;
    const gain = ctx.createGain();
    const lead = Math.min(Math.max(EDGE, fadeIn), length / 2);
    const tail = Math.min(Math.max(EDGE, fadeOut), length / 2);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + lead);
    gain.gain.setValueAtTime(volume, at + length - tail);
    gain.gain.linearRampToValueAtTime(0, at + length);
    gain.connect(ctx.destination);

    const sink = new AudioBufferSink(source.audioTrack);
    for await (const { buffer, timestamp, duration: bufferLength } of sink.buffers(from, end)) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      const skip = Math.max(0, from - timestamp);
      const usable = Math.min(bufferLength - skip, end - Math.max(timestamp, from));
      if (usable <= 0) continue;
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(gain);
      node.start(at + Math.max(0, timestamp - from), skip, usable);
    }
  };

  const starts = clipStarts(project.clips);
  for (let i = 0; i < project.clips.length; i++) {
    const c = project.clips[i];
    const source = sources.get(c.sourceId);
    if (source) await place(source, c.start, c.end, starts[i], c.volume, 0, 0);
  }
  for (const m of project.music) {
    const source = sources.get(m.sourceId);
    if (source) await place(source, m.start, m.end, m.at, m.volume, m.fadeIn, m.fadeOut);
  }
  return ctx.startRendering();
}
