// Renders one radio clip to an MP4 (H.264 + AAC, what Discord plays inline) in this browser,
// fitting it under Discord's upload limit, plus a still of it for the post's picture.
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat, canEncodeAudio } from "mediabunny";
import { canExportMp4 } from "@/lib/post-video/export";
import { MAX_VIDEO_BYTES } from "@/lib/post-video/model";
import { paintClipFrame, type ClipFrame } from "./frame";

/**
 * How a clip is encoded, from its length. The picture is mostly still (only the rings and the
 * waveform's progress move), so long clips can drop to 15 frames a second and a keyframe every
 * 10 s, which leaves the bits for the sound and a sharp picture under Discord's limit.
 */
export function encodePlan(seconds: number, maxBytes = MAX_VIDEO_BYTES) {
  const long = seconds > 120;
  const fps = long ? 15 : 30;
  const audio = seconds <= 180 ? 128_000 : 96_000;
  const keyFrameInterval = long ? 10 : 2;
  const video = (maxBytes * 8 * 0.9) / seconds - audio;
  return { fps, audio, keyFrameInterval, video };
}

export interface ClipExport {
  video: Blob;
  poster: Blob;
  bytes: number;
}

export interface ClipExportOptions {
  frame: ClipFrame;
  audio: AudioBuffer;
  peaks: number[];
  talk: Map<string, [number, number][]>;
  /** Server ms of the clip's first frame. */
  startMs: number;
  maxBytes?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** WebM is only for testing in browsers without an H.264 encoder. */
  format?: "mp4" | "webm";
}

async function renderOnce(o: ClipExportOptions, bitrate: number): Promise<ClipExport> {
  const format = o.format ?? "mp4";
  const duration = o.audio.duration;
  const plan = encodePlan(duration, o.maxBytes);
  const FPS = plan.fps;
  const frames = Math.max(1, Math.round(duration * FPS));
  const canvas = document.createElement("canvas");
  canvas.width = o.frame.layout.width;
  canvas.height = o.frame.layout.height;
  const ctx = canvas.getContext("2d", { alpha: false })!;

  const target = new BufferTarget();
  const output = new Output({ format: format === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target });
  const video = new CanvasSource(canvas, { codec: format === "mp4" ? "avc" : "vp9", bitrate, keyFrameInterval: plan.keyFrameInterval });
  output.addVideoTrack(video, { frameRate: FPS });
  const codec = format === "mp4" ? "aac" : "opus";
  if (!(await canEncodeAudio(codec, { bitrate: plan.audio }))) throw new Error("This browser cannot encode the sound for the video. Use Chrome or Edge.");
  const sound = new AudioBufferSource({ codec, bitrate: plan.audio });
  output.addAudioTrack(sound);

  let poster: Blob | null = null;
  const posterFrame = Math.min(frames - 1, Math.round(frames * 0.25));
  await output.start();
  try {
    const soundDone = sound.add(o.audio);
    for (let f = 0; f < frames; f++) {
      if (o.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const t = f / FPS;
      paintClipFrame(ctx, o.frame, o.peaks, t / duration, o.talk, o.startMs + t * 1000);
      await video.add(t, 1 / FPS);
      if (f === posterFrame) poster = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (f % 10 === 0) o.onProgress?.(f / frames);
    }
    await soundDone;
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => {});
    throw err;
  }
  if (!target.buffer || !poster) throw new Error("The video could not be written.");
  const blob = new Blob([target.buffer], { type: format === "mp4" ? "video/mp4" : "video/webm" });
  return { video: blob, poster, bytes: blob.size };
}

/** Renders the clip; if it comes out over the limit, again at a lower bitrate. */
export async function exportClip(o: ClipExportOptions): Promise<ClipExport> {
  const maxBytes = o.maxBytes ?? MAX_VIDEO_BYTES;
  if ((o.format ?? "mp4") === "mp4" && !(await canExportMp4())) {
    throw new Error("This browser cannot create the video (no H.264 encoder). Use Chrome or Edge on a computer.");
  }
  const duration = o.audio.duration;
  let shrink = 1;
  let last: ClipExport | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const plan = encodePlan(duration, maxBytes);
    const bits = (maxBytes * 8 * 0.9 * shrink) / duration - plan.audio;
    // a mostly still picture needs far less than a filmed video, so cap it lower
    const bitrate = Math.round(Math.min(4_000_000, Math.max(100_000, bits)));
    last = await renderOnce(o, bitrate);
    if (last.bytes <= maxBytes) return last;
    shrink *= Math.min(0.9, (maxBytes * 0.95) / last.bytes);
  }
  throw new Error(`The clip is ${(last!.bytes / 1048576).toFixed(1)} MB, over the ${Math.round(maxBytes / 1048576)} MB limit. Make it shorter.`);
}
