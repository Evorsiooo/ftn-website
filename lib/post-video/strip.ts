import { AudioBufferSink, CanvasSink } from "mediabunny";
import type { LoadedSource } from "./sources";

// Pictures and sound shapes for the timeline: small frames along each video and the loudness of
// each song, worked out once per imported file and kept for as long as the editor is open.

/** Frames along a video file, one every `step` seconds. */
export interface Filmstrip {
  step: number;
  frames: string[];
}

/** Loudness of a sound file, `rate` values per second, each between 0 and 1. */
export interface Waveform {
  rate: number;
  peaks: Float32Array;
}

const FRAME_W = 112;
const FRAME_H = 64;
const MAX_FRAMES = 60;
const PEAK_RATE = 40;

export async function makeFilmstrip(source: LoadedSource): Promise<Filmstrip | null> {
  const track = source.videoTrack;
  if (!track) return null;
  const duration = source.info.duration;
  const step = Math.max(0.5, duration / MAX_FRAMES);
  const times: number[] = [];
  for (let t = 0; t < duration; t += step) times.push(Math.min(t + 0.01, duration - 0.05));
  const sink = new CanvasSink(track, { width: FRAME_W, height: FRAME_H, fit: "cover" });
  const frames: string[] = [];
  let last = "";
  for await (const wrapped of sink.canvasesAtTimestamps(times)) {
    const canvas = wrapped?.canvas as HTMLCanvasElement | OffscreenCanvas | undefined;
    if (canvas) {
      if ("toDataURL" in canvas) last = canvas.toDataURL("image/jpeg", 0.6);
      else {
        const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.6 });
        last = URL.createObjectURL(blob);
      }
    }
    frames.push(last);
  }
  return { step, frames };
}

export async function makeWaveform(source: LoadedSource): Promise<Waveform | null> {
  const track = source.audioTrack;
  if (!track) return null;
  const length = Math.ceil(source.info.duration * PEAK_RATE);
  const peaks = new Float32Array(length);
  const sink = new AudioBufferSink(track);
  for await (const { buffer, timestamp } of sink.buffers()) {
    const data = buffer.getChannelData(0);
    const per = buffer.sampleRate / PEAK_RATE;
    for (let i = 0; i < data.length; i += 64) {
      const slot = Math.floor(timestamp * PEAK_RATE + i / per);
      if (slot < 0 || slot >= length) continue;
      const v = Math.abs(data[i]);
      if (v > peaks[slot]) peaks[slot] = v;
    }
  }
  let max = 0;
  for (const v of peaks) if (v > max) max = v;
  if (max > 0) for (let i = 0; i < length; i++) peaks[i] = Math.min(1, peaks[i] / max);
  return { rate: PEAK_RATE, peaks };
}
