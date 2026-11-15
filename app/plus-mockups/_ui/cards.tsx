// Video cards and helpers for the FTN+ mockups.
import Link from "next/link";
import { LOGOS, VIDEOS, type Video } from "./data";

export const M = "/plus-mockups";
/** The moment the content was captured, so ages read as they did then. */
const NOW = Date.parse("2026-11-15T12:00:00Z");

export const byId = new Map(VIDEOS.map((v) => [v.id, v]));
export const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((v): v is Video => !!v);
export const thumb = (id: string, size: "maxresdefault" | "hqdefault" | "mqdefault" = "hqdefault") => `https://i.ytimg.com/vi/${id}/${size}.jpg`;
export const logo = (channel: string) => LOGOS[channel];

export function ago(iso: string) {
  const s = Math.max(0, (NOW - Date.parse(iso)) / 1000);
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
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoCard({ v, progress, live, sub }: { v: Video; progress?: number; live?: boolean; sub?: string }) {
  return (
    <Link href={`${M}/watch/${v.id}`} className="card">
      <div className="th">
        <img src={thumb(v.id)} alt="" loading="lazy" />
        {live ? <span className="live">LIVE</span> : <span className="dur">{duration(v.dur)}</span>}
        {progress != null && (
          <span className="bar">
            <i style={{ width: `${progress}%` }} />
          </span>
        )}
      </div>
      <div className="meta">
        <img src={logo(v.c)} alt="" loading="lazy" />
        <div style={{ minWidth: 0 }}>
          <div className="t">{v.t}</div>
          <div className="s">
            {v.c} · {sub ?? ago(v.at)}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function MiniCard({ v }: { v: Video }) {
  return (
    <Link href={`${M}/watch/${v.id}`} className="mini">
      <div className="th">
        <img src={thumb(v.id, "mqdefault")} alt="" loading="lazy" />
        <span className="dur">{duration(v.dur)}</span>
      </div>
      <div>
        <div className="t">{v.t}</div>
        <div className="s">
          {v.c} · {ago(v.at)}
        </div>
      </div>
    </Link>
  );
}
