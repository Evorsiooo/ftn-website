import { CanvasSink } from "mediabunny";
import { TEMPLATE } from "@/lib/post-template";
import type { LoadedSource } from "./sources";

// Videos from some recorders have black bars baked into the picture. This finds them in a
// few sample frames and returns the zoom and focus that fill the video area without them.
const SAMPLES = 5;
const ANALYSIS_WIDTH = 320;
// A row or column counts as black when nearly all of its pixels are this dark.
const DARK = 28;
const DARK_SHARE = 0.985;
// Ignore bars thinner than this share of the picture, and never crop more than this away.
const MIN_BAR = 0.008;
const MAX_CROP = 0.4;

export interface Framing {
  zoom: number;
  focusX: number;
  focusY: number;
}

const DEFAULT: Framing = { zoom: 1, focusX: 0.5, focusY: 0.5 };

/** The part of the picture inside any black bars, as fractions of the full frame. */
async function contentBox(source: LoadedSource, start: number, end: number) {
  const track = source.videoTrack;
  if (!track || source.info.width <= 0 || source.info.height <= 0) return null;
  const width = Math.min(ANALYSIS_WIDTH, source.info.width);
  const height = Math.max(2, Math.round((source.info.height / source.info.width) * width));
  const sink = new CanvasSink(track, { width, height, fit: "fill" });
  const span = Math.max(0, end - start - 0.05);
  const times = Array.from({ length: SAMPLES }, (_, i) => start + (span * (i + 0.5)) / SAMPLES);

  const rowDark = new Array<boolean>(height).fill(true);
  const colDark = new Array<boolean>(width).fill(true);
  let seen = 0;
  for await (const wrapped of sink.canvasesAtTimestamps(times)) {
    if (!wrapped) continue;
    const ctx = (wrapped.canvas as HTMLCanvasElement).getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;
    const { data } = ctx.getImageData(0, 0, width, height);
    const rowCount = new Array<number>(height).fill(0);
    const colCount = new Array<number>(width).fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (Math.max(data[i], data[i + 1], data[i + 2]) <= DARK) {
          rowCount[y]++;
          colCount[x]++;
        }
      }
    }
    for (let y = 0; y < height; y++) if (rowCount[y] / width < DARK_SHARE) rowDark[y] = false;
    for (let x = 0; x < width; x++) if (colCount[x] / height < DARK_SHARE) colDark[x] = false;
    seen++;
  }
  if (seen === 0) return null;

  const edge = (dark: boolean[], fromEnd: boolean) => {
    let n = 0;
    while (n < dark.length && dark[fromEnd ? dark.length - 1 - n : n]) n++;
    return n;
  };
  const clean = (n: number, size: number) => {
    const share = n / size;
    if (share < MIN_BAR || share > MAX_CROP) return 0;
    // A little extra, so the soft edge of the bar does not show.
    return Math.min(size * MAX_CROP, n + 2) / size;
  };
  const top = clean(edge(rowDark, false), height);
  const bottom = clean(edge(rowDark, true), height);
  const left = clean(edge(colDark, false), width);
  const right = clean(edge(colDark, true), width);
  if (top + bottom + left + right === 0) return null;
  return { x: left, y: top, w: 1 - left - right, h: 1 - top - bottom };
}

/** Zoom and focus that fill the video area with the picture, cropping black bars. */
export async function detectFraming(source: LoadedSource, start: number, end: number): Promise<Framing> {
  try {
    const box = await contentBox(source, start, end);
    if (!box) return DEFAULT;
    const W = source.info.width;
    const H = source.info.height;
    const rect = TEMPLATE.photo;
    const cover = Math.max(rect.w / W, rect.h / H);
    const scale = Math.max(rect.w / (box.w * W), rect.h / (box.h * H));
    // Top-left of the visible region, centred in the picture without bars.
    const viewW = rect.w / scale;
    const viewH = rect.h / scale;
    const left = box.x * W + (box.w * W - viewW) / 2;
    const top = box.y * H + (box.h * H - viewH) / 2;
    const focus = (offset: number, full: number, view: number) => (full - view > 1e-6 ? Math.min(1, Math.max(0, offset / (full - view))) : 0.5);
    return {
      zoom: Math.min(3, Math.max(1, scale / cover)),
      focusX: focus(left, W, viewW),
      focusY: focus(top, H, viewH),
    };
  } catch {
    return DEFAULT;
  }
}
