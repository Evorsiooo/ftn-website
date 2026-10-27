// Canvas renderer for the 1024x1024 FTN post image. The same function draws the
// live preview and the final PNG, so they always match. All positions come from the
// exported template assets (every asset is a full 1024x1024 layer drawn at 0,0).

export const POST_SIZE = 1024;

export const TEMPLATE = {
  textColor: "#041E41",
  // Photo hole inside BOX.png.
  photo: { x: 21, y: 21, w: 981, h: 766 },
  // Bottom edge of BOX.png, and the fill of the gap between it and the advert strip.
  // Transparent, like the exported example; the editor shows a dark checkerboard behind
  // the canvas so the white disclaimer stays readable there.
  boxBottom: 809,
  gapFill: null as string | null,
  // Advert strip.
  ad: { x: 0, y: 844, w: 1024, h: 180 },
  headline: {
    // Adrien's text frame is X 189.8, W 813.3 (right edge 1003.1). The example's text starts
    // at x 221, so the frame has an inset: text starts at 220 and wraps at the same right edge.
    x: 220,
    maxWidth: 783,
    firstBaseline: 44,
    lineHeight: 38,
    fontSize: 41.3,
    maxLines: 3,
  },
  body: {
    // Frame is X 11.8, W 991.4. Wrapping at the full width would pull "(8" up to the end of
    // line 5 (it fits by 0.1 px), unlike the example, so wrap just under it.
    x: 11.8,
    maxWidth: 990,
    firstBaseline: 149,
    lineHeight: 25,
    fontSize: 19.6,
  },
  // White fade over the top of the photo, positioned under the body text.
  fade: { gapBelowBody: 28, length: 45, minStart: 150 },
  // Corner radius of the ROUNDING.png shape (top-left 14x14, mirrored for the other corners).
  roundingSize: 16,
  maxBodyBottom: 620,
  // Video has no transparency, so the gap above the ad and the outer corners get this colour.
  videoBackdrop: "#041E41",
};

export const LOGOS: { key: string; label: string; src: string }[] = [
  { key: "whcn", label: "WHCN (Harrison County)", src: "/post-template/logos/whcn.png" },
];

// The logo each Ro-State's posts use. Add a logo to LOGOS and point its Ro-State here.
const DEFAULT_LOGO = "whcn";
export const RO_STATE_LOGOS: Record<string, string> = {
  harrison: "whcn",
  ridgeway: "whcn",
  madison: "whcn",
  clark: "whcn",
  firestone: "whcn",
  international: "whcn",
};

export function logoForRoState(roState: string): string {
  return RO_STATE_LOGOS[roState] ?? DEFAULT_LOGO;
}

const ASSET_PATHS = {
  box: "/post-template/BOX.png?v=2",
  boilerplate: "/post-template/BOILERPLATE_ADVERT.png",
  notice: "/post-template/ADVERT_NOTICE.png",
  rounding: "/post-template/ROUNDING.png",
};

// White is drawn this many px under the frame so anti-aliased hole edges show no seam.
const SEAM = 2;

const FONT_BOLD = "UnboundedBold";
const FONT_MEDIUM = "UnboundedMedium";

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let cached = imageCache.get(src);
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        imageCache.delete(src);
        reject(new Error(`Could not load ${src}`));
      };
      img.src = src;
    });
    imageCache.set(src, cached);
  }
  return cached;
}

let fontsReady: Promise<void> | null = null;

export function loadTemplateFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = (async () => {
      const faces = [
        new FontFace(FONT_BOLD, "url(/post-template/fonts/Unbounded-Bold.ttf)", { weight: "700" }),
        new FontFace(FONT_MEDIUM, "url(/post-template/fonts/Unbounded-Medium.ttf)", { weight: "500" }),
      ];
      const loaded = await Promise.all(faces.map((f) => f.load()));
      loaded.forEach((f) => document.fonts.add(f));
    })().catch((err) => {
      fontsReady = null;
      throw err;
    });
  }
  return fontsReady;
}

export interface PostRenderInput {
  headline: string;
  body: string;
  /** Background photo (already loaded), or null for an empty photo area. */
  photo: HTMLImageElement | null;
  /** Photo zoom (1 = cover) and focal point 0..1 in each direction. */
  photoZoom?: number;
  photoFocusX?: number;
  photoFocusY?: number;
  /** Key from LOGOS, or empty for none. */
  logo: string;
  /** Loaded 1024x180 ad image, or null to show the boilerplate "your advertisement here". */
  ad: HTMLImageElement | null;
}

export interface PostLayout {
  headlineLines: string[];
  bodyLines: string[];
  headlineOverflow: boolean;
  bodyBottom: number;
  bodyTooLong: boolean;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  // Drop trailing blank lines so they do not push the fade down.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function layoutText(ctx: CanvasRenderingContext2D, headline: string, body: string): PostLayout {
  const h = TEMPLATE.headline;
  const b = TEMPLATE.body;

  ctx.font = `700 ${h.fontSize}px ${FONT_BOLD}`;
  const allHeadlineLines = wrapText(ctx, headline.trim().toUpperCase(), h.maxWidth);
  const headlineLines = allHeadlineLines.slice(0, h.maxLines);

  ctx.font = `500 ${b.fontSize}px ${FONT_MEDIUM}`;
  const bodyLines = wrapText(ctx, body.trim(), b.maxWidth);

  const bodyBottom = bodyLines.length > 0 ? b.firstBaseline + (bodyLines.length - 1) * b.lineHeight + 6 : 0;
  return {
    headlineLines,
    bodyLines,
    headlineOverflow: allHeadlineLines.length > h.maxLines,
    bodyBottom,
    bodyTooLong: bodyBottom > TEMPLATE.maxBodyBottom,
  };
}

// Draws a photo or video frame to cover `rect`, zoomed and shifted by the focal point.
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  rect: { x: number; y: number; w: number; h: number },
  zoom: number,
  fx: number,
  fy: number
) {
  const scale = Math.max(rect.w / sourceWidth, rect.h / sourceHeight) * Math.max(1, zoom);
  const dw = sourceWidth * scale;
  const dh = sourceHeight * scale;
  const dx = rect.x - (dw - rect.w) * Math.min(1, Math.max(0, fx));
  const dy = rect.y - (dh - rect.h) * Math.min(1, Math.max(0, fy));
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

// Draws the advert strip with its four corners cut by the rounding shape.
function drawAd(ctx: CanvasRenderingContext2D, ad: HTMLImageElement | null, boilerplate: HTMLImageElement, rounding: HTMLImageElement) {
  const { x, y, w, h } = TEMPLATE.ad;
  const strip = document.createElement("canvas");
  strip.width = w;
  strip.height = h;
  const sctx = strip.getContext("2d")!;

  if (ad) {
    sctx.drawImage(ad, 0, 0, w, h);
  } else {
    // The boilerplate is a full-size layer with the strip already rounded at its position.
    sctx.drawImage(boilerplate, 0, -y);
    ctx.drawImage(strip, x, y);
    return;
  }

  const s = TEMPLATE.roundingSize;
  sctx.globalCompositeOperation = "destination-out";
  for (const [flipX, flipY] of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const) {
    sctx.save();
    sctx.translate(flipX ? w : 0, flipY ? h : 0);
    sctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    sctx.drawImage(rounding, 0, 0, s, s, 0, 0, s, s);
    sctx.restore();
  }
  ctx.drawImage(strip, x, y);
}

export interface PostLayers {
  /** Everything behind the photo area: the white page (and the backdrop for video). */
  under: HTMLCanvasElement;
  /** Everything over it: the white fade, frame, logo, text, ad and notice. */
  over: HTMLCanvasElement;
  layout: PostLayout;
}

function newLayer(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = POST_SIZE;
  canvas.height = POST_SIZE;
  return canvas;
}

/**
 * Draws the template as two layers with a hole between them for the photo or video, so a
 * video can redraw only the hole on every frame. `backdrop` fills the whole post first; it
 * is used for video, which has no transparency.
 */
export async function buildPostLayers(
  input: Omit<PostRenderInput, "photo">,
  backdrop: string | null = null
): Promise<PostLayers> {
  await loadTemplateFonts();
  const [box, boilerplate, notice, rounding] = await Promise.all([
    loadImage(ASSET_PATHS.box),
    loadImage(ASSET_PATHS.boilerplate),
    loadImage(ASSET_PATHS.notice),
    loadImage(ASSET_PATHS.rounding),
  ]);
  const logo = LOGOS.find((l) => l.key === input.logo);
  const logoImg = logo ? await loadImage(logo.src) : null;

  const under = newLayer();
  const over = newLayer();
  const uctx = under.getContext("2d")!;
  const ctx = over.getContext("2d")!;

  // 1. Gap above the ad (holds the white disclaimer text). Outer corners stay transparent
  // because BOX.png carries its own rounding.
  if (backdrop) {
    uctx.fillStyle = backdrop;
    uctx.fillRect(0, 0, POST_SIZE, POST_SIZE);
  } else if (TEMPLATE.gapFill) {
    uctx.fillStyle = TEMPLATE.gapFill;
    uctx.fillRect(0, TEMPLATE.boxBottom, POST_SIZE, TEMPLATE.ad.y - TEMPLATE.boxBottom);
  }

  // 2. White page under the photo. It is clipped to the frame so BOX's rounded corners
  // are not filled in.
  const p = TEMPLATE.photo;
  uctx.fillStyle = "#fff";
  uctx.fillRect(p.x - SEAM, p.y - SEAM, p.w + SEAM * 2, p.h + SEAM * 2);

  // 3. White area behind the text, fading into the photo. It follows the body height.
  ctx.font = `500 ${TEMPLATE.body.fontSize}px ${FONT_MEDIUM}`;
  const layout = layoutText(ctx, input.headline, input.body);
  const fadeStart = Math.max(TEMPLATE.fade.minStart, layout.bodyBottom + TEMPLATE.fade.gapBelowBody);
  ctx.fillStyle = "#fff";
  ctx.fillRect(p.x - SEAM, p.y - SEAM, p.w + SEAM * 2, fadeStart - p.y + SEAM);
  const gradient = ctx.createLinearGradient(0, fadeStart, 0, fadeStart + TEMPLATE.fade.length);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(p.x, fadeStart, p.w, TEMPLATE.fade.length);

  // 4. Frame, logo, text.
  ctx.drawImage(box, 0, 0);
  if (logoImg) ctx.drawImage(logoImg, 0, 0);

  ctx.fillStyle = TEMPLATE.textColor;
  ctx.textBaseline = "alphabetic";
  const h = TEMPLATE.headline;
  ctx.font = `700 ${h.fontSize}px ${FONT_BOLD}`;
  layout.headlineLines.forEach((line, i) => ctx.fillText(line, h.x, h.firstBaseline + i * h.lineHeight));
  const b = TEMPLATE.body;
  ctx.font = `500 ${b.fontSize}px ${FONT_MEDIUM}`;
  layout.bodyLines.forEach((line, i) => {
    if (line) ctx.fillText(line, b.x, b.firstBaseline + i * b.lineHeight);
  });

  // 5. Advert strip and its notice.
  drawAd(ctx, input.ad, boilerplate, rounding);
  ctx.drawImage(notice, 0, 0);

  return { under, over, layout };
}

/** A frame of photo or video to show in the photo area. */
export interface PhotoSource {
  image: CanvasImageSource;
  width: number;
  height: number;
}

/** Puts the layers and the photo together on a canvas context of POST_SIZE. */
export function paintPost(
  ctx: CanvasRenderingContext2D,
  layers: PostLayers,
  photo: PhotoSource | null,
  zoom = 1,
  focusX = 0.5,
  focusY = 0.5
) {
  ctx.clearRect(0, 0, POST_SIZE, POST_SIZE);
  ctx.drawImage(layers.under, 0, 0);
  const p = TEMPLATE.photo;
  if (photo) {
    drawCover(ctx, photo.image, photo.width, photo.height, p, zoom, focusX, focusY);
  } else {
    ctx.fillStyle = "#e5e5e5";
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  ctx.drawImage(layers.over, 0, 0);
}

export async function renderPost(canvas: HTMLCanvasElement, input: PostRenderInput): Promise<PostLayout> {
  const layers = await buildPostLayers(input);
  canvas.width = POST_SIZE;
  canvas.height = POST_SIZE;
  const photo = input.photo
    ? { image: input.photo, width: input.photo.naturalWidth, height: input.photo.naturalHeight }
    : null;
  paintPost(canvas.getContext("2d")!, layers, photo, input.photoZoom ?? 1, input.photoFocusX ?? 0.5, input.photoFocusY ?? 0.5);
  return layers.layout;
}
