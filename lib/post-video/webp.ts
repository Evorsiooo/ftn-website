// Animated WebP export: the post with transparency (the gap above the ad and the rounded
// corners stay see-through), but without sound. Browsers can only encode single WebP
// images, so each frame is encoded with the canvas and the frames are put together into an
// animated WebP file here.
import { TEMPLATE, type PostLayers } from "@/lib/post-template";
import { frameTimes, renderFrames } from "./frames";
import { MAX_DURATION, MAX_VIDEO_BYTES, projectDuration, type Project } from "./model";
import type { LoadedSource } from "./sources";

export interface WebpOptions {
  project: Project;
  sources: Map<string, LoadedSource>;
  layers: PostLayers;
  maxBytes?: number;
  onProgress?: (fraction: number, label: string) => void;
  signal?: AbortSignal;
}

export interface WebpResult {
  video: Blob;
  poster: Blob;
  duration: number;
  bytes: number;
  fps: number;
  quality: number;
}

// Frame rate and quality to try, best first. The first one that is expected to fit is used.
const CANDIDATES: { fps: number; quality: number }[] = [
  { fps: 20, quality: 0.8 },
  { fps: 20, quality: 0.65 },
  { fps: 15, quality: 0.8 },
  { fps: 15, quality: 0.65 },
  { fps: 15, quality: 0.5 },
  { fps: 12, quality: 0.5 },
  { fps: 10, quality: 0.5 },
  { fps: 10, quality: 0.4 },
  { fps: 10, quality: 0.3 },
];
const CALIBRATION_QUALITIES = [0.8, 0.65, 0.5, 0.4, 0.3];
const CALIBRATION_FRAMES = 8;
const HEADROOM = 0.9;

// Frames after the first only redraw this part of the post (even offsets, as WebP needs).
const REGION = (() => {
  const p = TEMPLATE.photo;
  const x = p.x - (p.x % 2);
  const y = p.y - (p.y % 2);
  return { x, y, w: p.x + p.w - x + 1, h: p.y + p.h - y + 1 };
})();

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** Whether this browser can encode WebP images from a canvas (Chrome and Edge can). */
export async function canExportWebp(): Promise<boolean> {
  const c = document.createElement("canvas");
  c.width = c.height = 2;
  const blob = await toBlob(c, "image/webp", 0.8);
  return blob?.type === "image/webp";
}

const u32 = (n: number) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
const u24 = (n: number) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255]);
const u16 = (n: number) => new Uint8Array([n & 255, (n >> 8) & 255]);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function chunk(tag: string, payload: Uint8Array[]): Uint8Array[] {
  const size = payload.reduce((n, p) => n + p.length, 0);
  const out = [ascii(tag), u32(size), ...payload];
  if (size % 2) out.push(new Uint8Array(1));
  return out;
}

/** The image chunks (ALPH, VP8, VP8L) of a single WebP file, without its container. */
export function imageChunks(file: Uint8Array): Uint8Array {
  const tag = (at: number) => String.fromCharCode(file[at], file[at + 1], file[at + 2], file[at + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") throw new Error("The browser produced an invalid WebP image.");
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const kept: Uint8Array[] = [];
  let at = 12;
  while (at + 8 <= file.length) {
    const name = tag(at);
    const size = view.getUint32(at + 4, true);
    const end = at + 8 + size + (size % 2);
    if (name === "ALPH" || name === "VP8 " || name === "VP8L") kept.push(file.subarray(at, Math.min(end, file.length)));
    at = end;
  }
  if (kept.length === 0) throw new Error("The browser produced an invalid WebP image.");
  return concat(kept);
}

export interface WebpFrame {
  data: Uint8Array;
  x: number;
  y: number;
  width: number;
  height: number;
  durationMs: number;
}

/** Builds an animated WebP file that loops forever. Frames overwrite what is under them. */
export function muxAnimatedWebp(width: number, height: number, frames: WebpFrame[]): Blob {
  const flags = 0x02 | 0x10; // animation + alpha
  const body: Uint8Array[] = [
    ascii("WEBP"),
    ...chunk("VP8X", [new Uint8Array([flags, 0, 0, 0]), u24(width - 1), u24(height - 1)]),
    ...chunk("ANIM", [new Uint8Array(4), u16(0)]),
  ];
  for (const f of frames) {
    const header = concat([u24(f.x / 2), u24(f.y / 2), u24(f.width - 1), u24(f.height - 1), u24(f.durationMs), new Uint8Array([0x02])]);
    body.push(...chunk("ANMF", [header, f.data]));
  }
  const size = body.reduce((n, p) => n + p.length, 0);
  return new Blob([ascii("RIFF"), u32(size), ...body] as BlobPart[], { type: "image/webp" });
}

async function encodeFrame(canvas: HTMLCanvasElement, quality: number, region: boolean): Promise<Uint8Array> {
  let source = canvas;
  if (region) {
    source = document.createElement("canvas");
    source.width = REGION.w;
    source.height = REGION.h;
    source.getContext("2d")!.drawImage(canvas, REGION.x, REGION.y, REGION.w, REGION.h, 0, 0, REGION.w, REGION.h);
  }
  const blob = await toBlob(source, "image/webp", quality);
  if (!blob || blob.type !== "image/webp") throw new Error("This browser cannot create WebP images. Use Chrome or Edge.");
  return imageChunks(new Uint8Array(await blob.arrayBuffer()));
}

/** Average encoded size of a frame at each calibration quality, from a few sample frames. */
async function calibrate(opts: WebpOptions, duration: number) {
  const times = Array.from({ length: CALIBRATION_FRAMES }, (_, i) => ((i + 0.5) / CALIBRATION_FRAMES) * duration);
  const totals = new Map<number, number>(CALIBRATION_QUALITIES.map((q) => [q, 0]));
  let full = 0;
  await renderFrames({ ...opts, times, alpha: true }, async (canvas, index) => {
    for (const q of CALIBRATION_QUALITIES) {
      const data = await encodeFrame(canvas, q, true);
      totals.set(q, totals.get(q)! + data.length);
    }
    if (index === 0) full = (await encodeFrame(canvas, 0.65, false)).length;
    opts.onProgress?.(((index + 1) / CALIBRATION_FRAMES) * 0.1, "Measuring size");
  });
  const average = new Map([...totals].map(([q, bytes]) => [q, bytes / CALIBRATION_FRAMES]));
  const fullRatio = full / (average.get(0.65) || 1);
  return { average, fullRatio };
}

function estimate(frames: number, quality: number, c: { average: Map<number, number>; fullRatio: number }) {
  const perFrame = c.average.get(quality) ?? Math.min(...c.average.values());
  return perFrame * (frames - 1 + c.fullRatio) + 400;
}

/**
 * Renders the post as an animated WebP with transparency and no sound, picking the frame
 * rate and quality that keep it under the Discord limit.
 */
export async function exportAnimatedWebp(opts: WebpOptions): Promise<WebpResult> {
  const duration = projectDuration(opts.project);
  if (opts.project.clips.length === 0 || duration <= 0) throw new Error("Add a video first.");
  if (duration > MAX_DURATION + 0.05) throw new Error(`The video can be at most ${MAX_DURATION} seconds.`);
  if (!(await canExportWebp())) throw new Error("This browser cannot create WebP images. Use Chrome or Edge on a computer.");
  const maxBytes = opts.maxBytes ?? MAX_VIDEO_BYTES;
  const width = opts.layers.under.width;
  const height = opts.layers.under.height;

  const measured = await calibrate(opts, duration);
  let candidates = CANDIDATES.filter((c) => estimate(Math.round(duration * c.fps), c.quality, measured) <= maxBytes * HEADROOM);
  if (candidates.length === 0) {
    throw new Error(
      `An animated WebP of this length does not fit in ${Math.round(maxBytes / 1048576)} MB. Make the video shorter, or turn off the transparent option to make an MP4.`
    );
  }

  let last: WebpResult | null = null;
  for (let attempt = 0; attempt < 3 && candidates.length > 0; attempt++) {
    const { fps, quality } = candidates[0];
    const total = Math.round(duration * fps);
    const frames: WebpFrame[] = [];
    let poster: Blob | null = null;
    const posterFrame = Math.round(total * 0.25);

    await renderFrames({ ...opts, times: frameTimes(duration, fps), alpha: true }, async (canvas, index) => {
      const first = index === 0;
      const data = await encodeFrame(canvas, quality, !first);
      frames.push({
        data,
        x: first ? 0 : REGION.x,
        y: first ? 0 : REGION.y,
        width: first ? width : REGION.w,
        height: first ? height : REGION.h,
        // Rounded from the running time, so the total stays exact.
        durationMs: Math.round(((index + 1) * 1000) / fps) - Math.round((index * 1000) / fps),
      });
      if (index === posterFrame) poster = await toBlob(canvas, "image/png");
      if (index % 3 === 0) opts.onProgress?.(0.1 + 0.9 * (index / total), attempt > 0 ? "Too large, trying again" : "Rendering");
    });

    const video = muxAnimatedWebp(width, height, frames);
    last = { video, poster: poster ?? (await toBlob(document.createElement("canvas"), "image/png"))!, duration, bytes: video.size, fps, quality };
    if (video.size <= maxBytes) return last;
    // Too big: keep only candidates that would still fit if the estimate is off by the same factor.
    const miss = video.size / estimate(total, quality, measured);
    candidates = candidates
      .slice(1)
      .filter((c) => estimate(Math.round(duration * c.fps), c.quality, measured) * miss <= maxBytes * HEADROOM);
  }
  throw new Error(
    `The animated WebP is ${((last?.bytes ?? 0) / 1048576).toFixed(1)} MB, over the ${Math.round(maxBytes / 1048576)} MB limit. Make the video shorter.`
  );
}
