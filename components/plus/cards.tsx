"use client";
// Video cards and helpers for FTN+ (the approved mockups' cards, on the library's real rows).
import Link from "next/link";
import { watchPath } from "@/lib/plus-links";
import { LiveMark } from "./live";

/** One video or stream as FTN+ shows it, from a /api/plus/videos row. */
export type PlusVideo = {
  /** The public id used in watch links (the YouTube id, or the Twitch broadcast's id). */
  id: string;
  title: string;
  channel: string;
  channelId: string;
  logo: string | null;
  description: string;
  thumb: string;
  publishedAt: string;
  live: boolean;
  stream: boolean;
  durationSec: number;
};

export function toVideo(v: any): PlusVideo {
  const id = v.youtubeId || v.id;
  return {
    id,
    title: cleanTitle(v.title || ""),
    channel: v.channelTitle || "FTN",
    channelId: v.channelId || "",
    logo: v.channelLogoUrl || null,
    description: firstParagraph(v.description || ""),
    thumb: v.thumbnailUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    publishedAt: v.publishedAt ? new Date(v.publishedAt).toISOString() : new Date().toISOString(),
    live: !!v.isLive,
    stream: !!v.isLive || v.videoType === "livestream",
    durationSec: Number(v.durationSeconds) || 0,
  };
}

/** YouTube titles often end in a run of hashtags: they read as noise on a card. */
export function cleanTitle(t: string) {
  const cleaned = t.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim();
  return cleaned || t.trim();
}

/** Most descriptions are a paragraph then links: the paragraph is what's worth showing. */
export function firstParagraph(d: string) {
  const para = d.split(/\n\s*\n/)[0]?.trim() ?? "";
  return /^https?:\/\//.test(para) ? "" : para;
}

export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  const units: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [n, u] of units) {
    const k = Math.floor(s / n);
    if (k >= 1) return `${k} ${u}${k > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export function duration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function ChannelLogo({ v, size }: { v: Pick<PlusVideo, "logo" | "channel">; size?: number }) {
  return v.logo ? (
    <img src={v.logo} alt="" loading="lazy" style={size ? { width: size, height: size } : undefined} />
  ) : (
    <span className="logo-fallback" aria-hidden style={size ? { width: size, height: size } : undefined}>
      {v.channel.slice(0, 1)}
    </span>
  );
}
export { ChannelLogo };

export function VideoCard({ v, progress, sub }: { v: PlusVideo; progress?: number; sub?: string }) {
  return (
    <Link href={watchPath(v.id)} className="card">
      <div className="th">
        <img src={v.thumb} alt="" loading="lazy" />
        {v.live ? <LiveMark /> : v.durationSec > 0 && <span className="dur">{duration(v.durationSec)}</span>}
        {progress != null && (
          <span className="bar">
            <i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </span>
        )}
      </div>
      <div className="meta">
        <ChannelLogo v={v} />
        <div style={{ minWidth: 0 }}>
          <div className="t">{v.title}</div>
          <div className="s">
            {v.channel} · {sub ?? (v.live ? `started ${ago(v.publishedAt)}` : ago(v.publishedAt))}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function MiniCard({ v }: { v: PlusVideo }) {
  return (
    <Link href={watchPath(v.id)} className="mini">
      <div className="th">
        <img src={v.thumb} alt="" loading="lazy" />
        {v.live ? <LiveMark /> : v.durationSec > 0 && <span className="dur">{duration(v.durationSec)}</span>}
      </div>
      <div>
        <div className="t">{v.title}</div>
        <div className="s">
          {v.channel} · {ago(v.publishedAt)}
        </div>
      </div>
    </Link>
  );
}

/** Placeholder row while the library loads. */
export function CardsLoading({ rows = 1 }: { rows?: number }) {
  return (
    <div className="cards one-row" aria-label="Loading">
      {Array.from({ length: 6 * rows }, (_, i) => (
        <div key={i} className="card">
          <div className="th ph-box" />
          <div className="ph-box" style={{ height: 14, marginTop: 12, width: "80%" }} />
        </div>
      ))}
    </div>
  );
}
