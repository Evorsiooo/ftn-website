// Draws a radio clip's video frame on a canvas, in FTN+'s style (components/plus/plus.css): the
// show's art blurred behind everything (the radio page's .glow and its shade), the show's logo, name
// and date, the headline, the people on air with the green ring while they talk (.stage), a
// waveform, then the same paid-ad notice and advert strip as every other post.
//
// Everything that does not move is drawn once into a base layer; a frame is that layer plus the
// rings and the waveform. The layout comes from one size (W x H, the ad strip at the bottom), so
// a 9:16 version only needs another size.
import { ASSET_PATHS, POST_SIZE, TEMPLATE, drawAd, loadImage, postHeight } from "@/lib/post-template";
import type { ShowPerson } from "./model";

// FTN+ tokens
const BG = "#16110a";
const SURFACE_2 = "#2e251a";
const TEXT = "#fff8e6";
const TEXT_2 = "rgba(255, 248, 230, 0.68)";
const UNPLAYED = "rgba(255, 248, 230, 0.28)";
const TALK = "#23a55a";
const TITLE_FONT = "FtnClipTitle";
const BODY_FONT = "FtnClipBody";
const PLUS_LOGO = "/logos/ftnplus_textwhite_transparent.png";

export const CLIP_W = POST_SIZE;
const PAD = 52;
const ART = 92;
const HEADLINE = { size: 66, line: 67.3, maxLines: 3, top: 40, maxWidth: 920 };
const WAVE = { height: 92, bars: 132, gap: 3, bottomGap: 30 };
/** Ring: 5 px of background, then 5 px of green (box-shadow 0 0 0 5px bg, 0 0 0 10px green). */
/** The ring width on FTN+ (3 px gap, 3 px green) at its 96 px avatar size. */
const RING = 3;
/** How fast the ring comes and goes (the CSS transition: 60 ms on, 260 ms off). */
const RING_ON_MS = 60;
const RING_OFF_MS = 260;

let fonts: Promise<void> | null = null;
export function loadClipFonts(): Promise<void> {
  if (!fonts) {
    fonts = (async () => {
      const faces = [
        new FontFace(TITLE_FONT, "url(/radio-clips/fonts/bricolage-grotesque-latin-wght-normal.woff2)", { weight: "100 900" }),
        new FontFace(BODY_FONT, "url(/radio-clips/fonts/dm-sans-latin-wght-normal.woff2)", { weight: "100 1000" }),
      ];
      (await Promise.all(faces.map((f) => f.load()))).forEach((f) => document.fonts.add(f));
    })().catch((err) => {
      fonts = null;
      throw err;
    });
  }
  return fonts;
}

/** Images from other sites go through the site, so the canvas can still be saved as a video. */
export function sameSite(url: string): string {
  return /^https?:\/\//.test(url) && !url.startsWith(location.origin) ? `/api/admin/posts/radio-shows/image?u=${encodeURIComponent(url)}` : url;
}

const tryImage = (src: string | null) => (src ? loadImage(sameSite(src)).catch(() => null) : Promise.resolve(null));

export interface ClipFrameInput {
  showName: string;
  /** Show logo / art (also the colour behind everything). */
  art: string | null;
  /** When the show aired, epoch ms. */
  date: number;
  headline: string;
  people: ShowPerson[];
  /** Loaded 1024x180 ad, null for the "your advertisement here" placeholder. */
  ad: HTMLImageElement | null;
  noAd: boolean;
}

export interface ClipLayout {
  width: number;
  height: number;
  headlineLines: string[];
  headlineOverflow: boolean;
  /** Where each person's avatar is (centre and radius). */
  stage: { userId: string; x: number; y: number; r: number }[];
  wave: { x: number; y: number; w: number; h: number };
}

export interface ClipFrame {
  base: HTMLCanvasElement;
  layout: ClipLayout;
}

/** Headline lines, wrapped like text-wrap: balance (the narrowest width that keeps the line count). */
function balance(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wrap = (w: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > w) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  const best = wrap(maxWidth);
  if (best.length <= 1) return best;
  let lo = maxWidth / 2;
  let hi = maxWidth;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (wrap(mid).length > best.length) lo = mid;
    else hi = mid;
  }
  return wrap(hi);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** "Thursday 20 November 2026". */
export function dateLine(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`;
}

/** Draws everything that stays still for the whole clip. */
export async function buildClipFrame(input: ClipFrameInput): Promise<ClipFrame> {
  await loadClipFonts();
  const width = CLIP_W;
  const height = postHeight(input.noAd, true);
  const [art, plus, boilerplate, notice, rounding, ...avatars] = await Promise.all([
    tryImage(input.art),
    loadImage(PLUS_LOGO),
    loadImage(ASSET_PATHS.boilerplate),
    loadImage(ASSET_PATHS.notice),
    loadImage(ASSET_PATHS.rounding),
    ...input.people.map((p) => tryImage(p.avatar)),
  ]);

  const base = document.createElement("canvas");
  base.width = width;
  base.height = height;
  const ctx = base.getContext("2d")!;
  const contentH = input.noAd ? height : TEMPLATE.boxBottom;

  // 1. Background: FTN+ dark, the art blurred and saturated over it, then the radio page's shade.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);
  if (art) {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.filter = "blur(80px) saturate(1.5)";
    const s = Math.max((width * 1.4) / art.naturalWidth, (height * 1.4) / art.naturalHeight);
    const dw = art.naturalWidth * s;
    const dh = art.naturalHeight * s;
    ctx.drawImage(art, width / 2 - dw / 2, height / 2 - dh / 2, dw, dh);
    ctx.restore();
  }
  let g = ctx.createLinearGradient(0, height, 0, 0);
  g.addColorStop(0, BG);
  g.addColorStop(0.45, "rgba(22, 17, 10, 0.35)");
  g.addColorStop(1, "rgba(22, 17, 10, 0.15)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  g = ctx.createLinearGradient(0, 0, width, 0);
  g.addColorStop(0, "rgba(22, 17, 10, 0.45)");
  g.addColorStop(0.55, "rgba(22, 17, 10, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  // 2. Top row: the show's logo, its name and the date, FTN+ on the right.
  let x = PAD;
  if (art) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 12;
    roundRect(ctx, x, PAD, ART, ART, 14);
    ctx.fillStyle = SURFACE_2;
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x, PAD, ART, ART, 14);
    ctx.clip();
    const s = Math.max(ART / art.naturalWidth, ART / art.naturalHeight);
    ctx.drawImage(art, x + ART / 2 - (art.naturalWidth * s) / 2, PAD + ART / 2 - (art.naturalHeight * s) / 2, art.naturalWidth * s, art.naturalHeight * s);
    ctx.restore();
    x += ART + 20;
  }
  const plusH = 34;
  const plusW = (plus.naturalWidth / plus.naturalHeight) * plusH;
  ctx.drawImage(plus, width - PAD - plusW, PAD + 6, plusW, plusH);
  const nameMax = width - PAD - plusW - 24 - x;
  ctx.fillStyle = TEXT;
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 34px ${TITLE_FONT}`;
  ctx.letterSpacing = "-1px";
  ctx.fillText(fit(ctx, input.showName, nameMax), x, PAD + ART / 2 - 4);
  ctx.font = `400 20px ${BODY_FONT}`;
  ctx.letterSpacing = "0px";
  ctx.fillStyle = TEXT_2;
  ctx.fillText(fit(ctx, dateLine(input.date), nameMax), x, PAD + ART / 2 + 26);

  // 3. Headline.
  ctx.font = `800 ${HEADLINE.size}px ${TITLE_FONT}`;
  ctx.letterSpacing = `${-0.035 * HEADLINE.size}px`;
  const lines = balance(ctx, input.headline, HEADLINE.maxWidth);
  const shown = lines.slice(0, HEADLINE.maxLines);
  ctx.fillStyle = TEXT;
  const headTop = PAD + ART + HEADLINE.top;
  shown.forEach((line, i) => ctx.fillText(line, PAD, headTop + HEADLINE.size * 0.86 + i * HEADLINE.line));
  ctx.letterSpacing = "0px";
  const headBottom = headTop + Math.max(1, shown.length) * HEADLINE.line;

  // 4. Waveform box, at the bottom of the picture.
  const wave = { x: PAD - 4, y: contentH - WAVE.bottomGap - WAVE.height, w: width - 2 * PAD + 8, h: WAVE.height };

  // 5. The people on air, centred between the headline and the waveform.
  const n = input.people.length;
  const size = n <= 3 ? 164 : n === 4 ? 140 : 118;
  const slotW = n <= 3 ? 190 : size + 26;
  const step = slotW + (n <= 3 ? 56 : 30);
  // everything on the stage is FTN+'s .stage scaled up from its 96 px avatar
  const k = size / 96;
  const nameSize = Math.round(15 * k);
  const nameGap = Math.round(10 * k);
  const blockH = size + nameGap + nameSize * 1.2;
  const top = (headBottom + wave.y) / 2 - blockH / 2;
  const stage: ClipLayout["stage"] = [];
  let cx = width / 2 - ((n - 1) * step) / 2;
  input.people.forEach((p, i) => {
    const r = size / 2;
    const cy = top + r;
    stage.push({ userId: p.userId, x: cx, y: cy, r });
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 24 * k;
    ctx.shadowOffsetY = 10 * k;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = SURFACE_2;
    ctx.fill();
    ctx.restore();
    const img = avatars[i];
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (img) {
      const s = Math.max(size / img.naturalWidth, size / img.naturalHeight);
      ctx.drawImage(img, cx - (img.naturalWidth * s) / 2, cy - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    } else {
      ctx.fillStyle = TEXT_2;
      ctx.font = `800 ${Math.round(size * 0.35)}px ${TITLE_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.name.slice(0, 1).toUpperCase(), cx, cy + 2);
    }
    ctx.restore();
    ctx.fillStyle = TEXT;
    ctx.font = `600 ${nameSize}px ${BODY_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(fit(ctx, p.name, slotW + 10), cx, cy + r + nameGap + nameSize * 0.95);
    ctx.textAlign = "left";
    cx += step;
  });

  // 6. The paid-ad notice and the advert, as on every post.
  if (!input.noAd) {
    drawAd(ctx, input.ad, boilerplate, rounding);
    ctx.drawImage(notice, 0, 0);
  }

  return {
    base,
    layout: { width, height, headlineLines: shown, headlineOverflow: lines.length > HEADLINE.maxLines, stage, wave },
  };
}

/** Cuts text with an ellipsis to fit a width. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** How much of the green ring shows at ms (0 to 1), from when the person talks. */
export function ringAt(spans: [number, number][] | undefined, ms: number): number {
  let on = 0;
  for (const [a, b] of spans ?? []) {
    if (ms >= a && ms < b) on = Math.max(on, Math.min(1, (ms - a) / RING_ON_MS));
    else if (ms >= b && ms < b + RING_OFF_MS) on = Math.max(on, 1 - (ms - b) / RING_OFF_MS);
  }
  return on;
}

/**
 * One frame: the base, a ring around whoever talks, and the waveform played up to `progress`.
 * `talk` maps a person to their talking spans (server ms), `ms` is the show's time of this frame.
 */
export function paintClipFrame(
  ctx: CanvasRenderingContext2D,
  frame: ClipFrame,
  peaks: number[] | null,
  progress: number,
  talk: Map<string, [number, number][]>,
  ms: number
) {
  const { base, layout } = frame;
  ctx.drawImage(base, 0, 0);
  for (const p of layout.stage) {
    const on = ringAt(talk.get(p.userId), ms);
    if (on <= 0) continue;
    ctx.save();
    ctx.globalAlpha = on;
    // FTN+: 0 0 0 3px var(--bg), 0 0 0 6px #23a55a around a 96 px avatar
    const ring = (p.r * 2 * RING) / 96;
    ctx.lineWidth = ring;
    ctx.strokeStyle = BG;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + ring / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = TALK;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + ring * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const { x, y, w, h } = layout.wave;
  const n = WAVE.bars;
  const bw = (w - WAVE.gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const v = peaks ? peaks[Math.min(peaks.length - 1, Math.floor((i / n) * peaks.length))]! : 0.06;
    const bh = Math.max(4, v * h);
    ctx.fillStyle = i / n < progress ? TEXT : UNPLAYED;
    roundRect(ctx, x + i * (bw + WAVE.gap), y + (h - bh) / 2, bw, bh, Math.min(3, bw / 2));
    ctx.fill();
  }
}

export const WAVE_BARS = WAVE.bars;
