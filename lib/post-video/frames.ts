import { CanvasSink, type WrappedCanvas } from "mediabunny";
import { POST_SIZE, paintPost, type PostLayers } from "@/lib/post-template";
import { clipLength, clipStarts, projectDuration, type Project } from "./model";
import type { LoadedSource } from "./sources";

const MAX_SOURCE_EDGE = 2560;

export const abortError = () => new DOMException("Export cancelled", "AbortError");

export interface FrameOptions {
  project: Project;
  sources: Map<string, LoadedSource>;
  layers: PostLayers;
  /** Timeline times (seconds, ascending) to draw. */
  times: number[];
  /** Keep transparency (for WebP). Video needs an opaque canvas. */
  alpha: boolean;
  /** Draw into this canvas instead of a new one (the video encoder reads from it). */
  canvas?: HTMLCanvasElement;
  signal?: AbortSignal;
}

/** Evenly spaced frame times for a video of `duration` seconds. */
export function frameTimes(duration: number, fps: number): number[] {
  const count = Math.round(duration * fps);
  return Array.from({ length: count }, (_, k) => k / fps);
}

/**
 * Draws the post for each requested time (clip frame under the template layers) and hands the
 * canvas to `onFrame`. The canvas is reused, so `onFrame` must finish with it before returning.
 */
export async function renderFrames(opts: FrameOptions, onFrame: (canvas: HTMLCanvasElement, index: number) => Promise<void>) {
  const { project, sources, layers, times, signal } = opts;
  const canvas = opts.canvas ?? document.createElement("canvas");
  canvas.width = POST_SIZE;
  canvas.height = layers.under.height;
  const ctx = canvas.getContext("2d", { alpha: opts.alpha })!;
  const starts = clipStarts(project.clips);

  let index = 0;
  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i];
    const source = sources.get(clip.sourceId);
    if (!source?.videoTrack) throw new Error("A clip's video file is missing.");
    const end = i === project.clips.length - 1 ? Infinity : starts[i] + clipLength(clip);

    const mine: number[] = [];
    while (index + mine.length < times.length && times[index + mine.length] < end - 1e-9) mine.push(times[index + mine.length]);
    if (mine.length === 0) continue;

    const edge = Math.max(source.info.width, source.info.height);
    const scale = edge > MAX_SOURCE_EDGE ? MAX_SOURCE_EDGE / edge : 1;
    const sink = new CanvasSink(source.videoTrack, {
      width: Math.round(source.info.width * scale),
      height: Math.round(source.info.height * scale),
      fit: "fill",
    });
    const sourceTimes = mine.map((t) => Math.min(clip.end - 0.001, clip.start + (t - starts[i])));

    let last: WrappedCanvas | null = null;
    for await (const wrapped of sink.canvasesAtTimestamps(sourceTimes)) {
      if (signal?.aborted) throw abortError();
      if (wrapped) last = wrapped;
      const shown = last?.canvas;
      paintPost(
        ctx,
        layers,
        shown ? { image: shown, width: shown.width, height: shown.height } : null,
        clip.zoom,
        clip.focusX,
        clip.focusY
      );
      await onFrame(canvas, index);
      index++;
    }
  }
}

export { projectDuration };
