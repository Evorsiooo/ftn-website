import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import { POST_SIZE, type PostLayers } from "@/lib/post-template";
import { frameTimes, renderFrames } from "./frames";
import { hasAudio, mixAudio } from "./audio-mix";
import { FPS, MAX_DURATION, MAX_VIDEO_BYTES, projectDuration, type Project } from "./model";
import type { LoadedSource } from "./sources";

export interface ExportResult {
  video: Blob;
  poster: Blob;
  duration: number;
  bytes: number;
  videoBitrate: number;
}

export interface ExportOptions {
  project: Project;
  sources: Map<string, LoadedSource>;
  layers: PostLayers;
  maxBytes?: number;
  onProgress?: (fraction: number, label: string) => void;
  signal?: AbortSignal;
  /** WebM is only for testing in browsers without an H.264 encoder. */
  format?: "mp4" | "webm";
}

const AUDIO_BITRATE = 128_000;

/** Whether this browser can write the MP4 (H.264 + AAC) that Discord plays inline. */
export async function canExportMp4(): Promise<boolean> {
  try {
    return await canEncodeVideo("avc", { width: POST_SIZE, height: POST_SIZE });
  } catch {
    return false;
  }
}

function pickBitrate(duration: number, maxBytes: number, withAudio: boolean, attempt: number): number {
  const budgetBits = maxBytes * 8 * 0.9 * Math.pow(0.85, attempt);
  const bits = budgetBits / duration - (withAudio ? AUDIO_BITRATE : 0);
  return Math.round(Math.min(10_000_000, Math.max(300_000, bits)));
}

async function renderOnce(opts: ExportOptions, videoBitrate: number, label: string): Promise<ExportResult> {
  const { project, sources, layers, signal } = opts;
  const format = opts.format ?? "mp4";
  const duration = projectDuration(project);
  const frames = Math.round(duration * FPS);
  const withAudio = hasAudio(project, sources);

  const canvas = document.createElement("canvas");
  canvas.width = POST_SIZE;
  canvas.height = layers.under.height;
  canvas.getContext("2d", { alpha: false });

  const target = new BufferTarget();
  const output = new Output({
    format: format === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target,
  });
  const videoSource = new CanvasSource(canvas, {
    codec: format === "mp4" ? "avc" : "vp9",
    bitrate: videoBitrate,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: FPS });

  let audioSource: AudioBufferSource | null = null;
  if (withAudio) {
    const codec = format === "mp4" ? "aac" : "opus";
    if (!(await canEncodeAudio(codec, { bitrate: AUDIO_BITRATE }))) {
      throw new Error("This browser cannot encode the sound for the video. Use Chrome or Edge.");
    }
    audioSource = new AudioBufferSource({ codec, bitrate: AUDIO_BITRATE });
    output.addAudioTrack(audioSource);
  }

  let poster: Blob | null = null;
  await output.start();
  try {
    opts.onProgress?.(0, `${label}Mixing sound`);
    // The sound is added while the frames are, so the writer can interleave them.
    let audioDone: Promise<void> | null = null;
    if (audioSource) {
      const mixed = await mixAudio(project, sources, duration, signal);
      audioDone = audioSource.add(mixed);
    }

    const posterFrame = Math.min(frames - 1, Math.round(frames * 0.25));
    await renderFrames(
      { project, sources, layers, times: frameTimes(duration, FPS), alpha: false, canvas, signal },
      async (frameCanvas, frame) => {
        await videoSource.add(frame / FPS, 1 / FPS);
        if (frame === posterFrame) {
          poster = await new Promise<Blob | null>((resolve) => frameCanvas.toBlob(resolve, "image/png"));
        }
        if (frame % 3 === 0) opts.onProgress?.(frame / frames, `${label}Rendering`);
      }
    );
    if (audioDone) await audioDone;
    opts.onProgress?.(1, `${label}Finishing`);
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => {});
    throw err;
  }

  const buffer = target.buffer;
  if (!buffer) throw new Error("The video could not be written.");
  const video = new Blob([buffer], { type: format === "mp4" ? "video/mp4" : "video/webm" });
  if (!poster) throw new Error("The video could not be written.");
  return { video, poster, duration, bytes: video.size, videoBitrate };
}

/**
 * Renders the project to an MP4, frame by frame, with the post template on top. If the file
 * comes out larger than the Discord limit it is rendered again at a lower bitrate.
 */
export async function exportPostVideo(opts: ExportOptions): Promise<ExportResult> {
  const duration = projectDuration(opts.project);
  if (opts.project.clips.length === 0 || duration <= 0) throw new Error("Add a video first.");
  if (duration > MAX_DURATION + 0.05) throw new Error(`The video can be at most ${MAX_DURATION} seconds.`);
  const maxBytes = opts.maxBytes ?? MAX_VIDEO_BYTES;
  const withAudio = hasAudio(opts.project, opts.sources);
  if ((opts.format ?? "mp4") === "mp4" && !(await canExportMp4())) {
    throw new Error("This browser cannot create the video (no H.264 encoder). Use Chrome or Edge on a computer.");
  }

  let result: ExportResult | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const bitrate = pickBitrate(duration, maxBytes, withAudio, attempt);
    result = await renderOnce(opts, bitrate, attempt > 0 ? "Too large, trying again. " : "");
    if (result.bytes <= maxBytes) return result;
  }
  throw new Error(
    `The video is ${(result!.bytes / 1048576).toFixed(1)} MB, over the ${Math.round(maxBytes / 1048576)} MB limit even at low quality. Make it shorter.`
  );
}
