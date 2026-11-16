// Link preview cards (the 1200x630 images Discord, X and others show under a shared link).
//
// The site never draws these images itself: Pages Functions on the free plan get about 10 ms of CPU, far
// too little to render an image. A GitHub workflow (.github/workflows/og-cards.yml) asks
// /api/og/pending which cards are missing, draws them in a headless browser from
// scripts/og/cards.html and uploads them to R2 (og/<key>.jpg) through /api/og/upload.
//
// A card's key includes a hash of everything drawn on it, so an edited title or a finished livestream
// gets a new image URL and the apps fetch it again. Until a card exists, pages fall back to a fixed image.
// Every card states facts that stay true (dates and UTC times), never "now", because the apps keep the
// first preview a link got.

export const SITE_URL = "https://ftn.euno.cc";

// Bump when scripts/og/cards.html changes how a card looks, so every card is drawn again.
export const CARD_VERSION = 1;

export type CardLayout = "news-item" | "plus-photo" | "plus-art";

export interface CardData {
  layout: CardLayout;
  title: string;
  sub?: string | null;
  meta: string;
  /** square picture on the right (news-item, plus-art) */
  art?: string | null;
  /** full-bleed photo (plus-photo) or the blurred backdrop (plus-art) */
  photo?: string | null;
  /** small round picture before the meta line (plus-photo) */
  avatar?: string | null;
}

export interface CardSpec {
  key: string;
  data: CardData;
}

/** Fixed images for pages without a card of their own (public/og/*.jpg). */
export const STATIC_CARDS = {
  home: "/og/home.jpg",
  articles: "/og/articles.jpg",
  tips: "/og/tips.jpg",
  plus: "/og/plus.jpg",
  videos: "/og/plus-videos.jpg",
  radio: "/og/plus-radio.jpg",
  schedule: "/og/plus-schedule.jpg",
  sports: "/og/plus-sports.jpg",
} as const;

export function absoluteUrl(url: string | null | undefined): string | null {
  const u = (url || "").trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("/")) return `${SITE_URL}${u}`;
  return null;
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "x";

function spec(kind: string, id: string, data: CardData): CardSpec {
  return { key: `${kind}/${safeId(id)}-${fnv1a(JSON.stringify([CARD_VERSION, data]))}`, data };
}

/** Where a card's image is served once it exists. */
export function cardImageUrl(key: string): string {
  return `${SITE_URL}/api/media/og/${key}.jpg`;
}

export const KEY_PATTERN = /^(article|video|league|show|call|replay)\/[A-Za-z0-9_-]{1,80}-[a-z0-9]{1,8}$/;

// ---- formatting (always UTC, the same for every viewer) ----

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(v: Date | number | string | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function fmtDay(v: Date | number | string | null | undefined): string {
  const d = toDate(v);
  return d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}` : "";
}

export function fmtTime(v: Date | number | string | null | undefined): string {
  const d = toDate(v);
  return d ? `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : "";
}

export function fmtLength(seconds: number | null | undefined): string {
  const s = Math.round(seconds || 0);
  if (s <= 0) return "";
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

const join = (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

// ---- one function per kind of card ----

const CATEGORY_LABEL: Record<string, string> = {
  news: "News",
  politics: "Politics",
  business: "Business",
  technology: "Technology",
  entertainment: "Entertainment",
  opinion: "Opinion",
};

export function articleCard(a: {
  id: string;
  title: string;
  category: string | null;
  authorName?: string | null;
  authorUsername?: string | null;
  publishedAt?: Date | number | string | null;
  createdAt?: Date | number | string | null;
  coverImageUrl?: string | null;
}): CardSpec {
  const author = a.authorName || a.authorUsername;
  return spec("article", a.id, {
    layout: "news-item",
    title: a.title,
    meta: join([CATEGORY_LABEL[a.category || ""] || null, author ? `By ${author}` : null, fmtDay(a.publishedAt ?? a.createdAt)]),
    art: absoluteUrl(a.coverImageUrl),
  });
}

export function videoCard(v: {
  id: string;
  title: string;
  channelTitle?: string | null;
  channelLogoUrl?: string | null;
  thumbnailUrl?: string | null;
  videoType?: string | null;
  isLive?: boolean | null;
  publishedAt?: Date | number | string | null;
  durationSeconds?: number | null;
}): CardSpec {
  const stream = v.videoType === "livestream";
  // A stream that is still running has no length yet: it shows when it started instead.
  const when = stream && v.isLive ? `${fmtDay(v.publishedAt)} · ${fmtTime(v.publishedAt)} UTC` : join([fmtDay(v.publishedAt), fmtLength(v.durationSeconds)]);
  return spec("video", v.id, {
    layout: "plus-photo",
    title: v.title,
    meta: join([v.channelTitle, stream ? "Livestream" : v.videoType === "podcast" ? "Podcast" : null, when]),
    photo: absoluteUrl(v.thumbnailUrl),
    avatar: absoluteUrl(v.channelLogoUrl),
  });
}

export function leagueCard(l: {
  slug: string;
  name: string;
  sport: string;
  season: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
}): CardSpec {
  return spec("league", l.slug, {
    layout: "plus-art",
    title: l.name,
    meta: join([l.sport, l.season ? `${l.season} season` : null]),
    art: absoluteUrl(l.logoUrl) || absoluteUrl(l.bannerUrl),
    photo: absoluteUrl(l.bannerUrl) || absoluteUrl(l.logoUrl),
  });
}

interface ShowSlot {
  broadcastId: string;
  title: string;
  presenter: string | null;
  artUrl: string | null;
  start: Date;
  end: Date;
}

function slotMeta(o: ShowSlot): string {
  const sameDay = fmtDay(o.start) === fmtDay(o.end);
  const end = sameDay ? fmtTime(o.end) : `${fmtDay(o.end)} ${fmtTime(o.end)}`;
  return `FTN Radio · ${fmtDay(o.start)} · ${fmtTime(o.start)}–${end} UTC`;
}

/** The radio page's card while a show is on air, and the host's call-in link (call = true). */
export function showCard(o: ShowSlot, call = false): CardSpec {
  const art = absoluteUrl(o.artUrl);
  return spec(call ? "call" : "show", `${o.broadcastId}-${o.start.getTime()}`, {
    layout: "plus-art",
    title: call ? `Call in to ${o.title}` : o.title,
    sub: o.presenter ? `with ${o.presenter}` : null,
    meta: slotMeta(o),
    art,
    photo: art,
  });
}

export function replayCard(r: {
  id: string;
  title: string;
  presenter?: string | null;
  artUrl?: string | null;
  startedAt: Date | number;
  endedAt?: Date | number | null;
}): CardSpec {
  const start = toDate(r.startedAt);
  const end = toDate(r.endedAt);
  const art = absoluteUrl(r.artUrl);
  return spec("replay", r.id, {
    layout: "plus-art",
    title: r.title,
    sub: r.presenter ? `with ${r.presenter}` : null,
    meta: join(["FTN Radio replay", fmtDay(start), start && end ? fmtLength((end.getTime() - start.getTime()) / 1000) : null]),
    art,
    photo: art,
  });
}

// ---- reading cards from R2 ----

function mediaBucket(): R2Bucket | null {
  const env = process.env as any;
  return (env.ftn_media as R2Bucket) || (env.MEDIA_BUCKET as R2Bucket) || null;
}

/** The card's URL when it has been drawn, otherwise null (the page then uses its fallback). */
export async function existingCardUrl(card: CardSpec | null): Promise<string | null> {
  if (!card) return null;
  try {
    const bucket = mediaBucket();
    if (!bucket) return null;
    const head = await bucket.head(`og/${card.key}.jpg`);
    return head ? cardImageUrl(card.key) : null;
  } catch {
    return null;
  }
}

export { mediaBucket };
