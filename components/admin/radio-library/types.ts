/** Shapes the Library page gets from /api/admin/radio/*. */

/** Song files are public on the ftn-radio bucket's own domain (no Worker request per play). */
export const RADIO_FILES_ORIGIN = "https://radio-files.euno.cc";
export const fileUrl = (key: string) => `${RADIO_FILES_ORIGIN}/${key.split("/").map(encodeURIComponent).join("/")}`;

export interface Song {
  id: string;
  key: string;
  source: "youtube" | "soundcloud" | "upload";
  sourceUrl: string | null;
  title: string;
  artist: string;
  album: string | null;
  durationSec: number;
  loudnessDb: number | null;
  thumbnail: string | null;
  archived: boolean;
  createdAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  sourceUrl: string | null;
  source: "youtube" | "soundcloud" | "spotify" | null;
  lastSyncedAt: string | null;
  updatedAt: string;
  songs: number;
}

export interface Candidate {
  url: string;
  title: string;
  artists?: string[];
  album?: string | null;
  durationSec?: number;
  kind?: string;
}

export interface Review {
  importId: string;
  playlistName: string | null;
  index: number;
  spotify: { title: string; artists: string[]; durationMs?: number } | null;
  candidates: Candidate[];
}

export interface Import {
  id: string;
  url: string;
  playlistId: string | null;
  playlistName: string | null;
  position: number | null;
  state: string;
  title: string | null;
  total: number | null;
  done: number;
  failed: number;
  error: string | null;
  createdAt: string;
}

export const FINAL = ["done", "failed", "cancelled"];

export function duration(sec: number | undefined | null): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}
