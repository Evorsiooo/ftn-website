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
  releaseYear: number | null;
  durationSec: number;
  loudnessDb: number | null;
  thumbnail: string | null;
  archived: boolean;
  /** BitChord's flag: the file is a music video (Automix's loop mixes skip it). */
  musicVideo?: boolean;
  /** Where title and artist came from; "ytmusic" = YouTube Music's catalogue (the album song). */
  metadataSource?: string | null;
  /** The album-audio check: null (not yet), album, swapped, unmatched, failed, duplicate. */
  audioCheck?: "album" | "swapped" | "unmatched" | "failed" | "duplicate" | "downloading" | null;
  audioCheckNote?: string | null;
  /** Lyrics for every listener: null = best available, a provider id, or "none"; and the offset in ms. */
  lyricsSource: string | null;
  lyricsOffsetMs: number;
  /** Getting ready: on air once analysed for mixing and title-checked (null: not yet). */
  analysedAt?: string | null;
  metaCheckedAt?: string | null;
  /** Set aside by Prepare: "missing" (no audio file) or "failed". */
  prepError?: "missing" | "failed" | null;
  createdAt: string;
}

/** The album-audio check's state, from GET /api/admin/radio/imports. */
export interface AlbumAudio {
  counts: Record<string, number> | null;
  running: boolean;
  /** Approximate minutes left, from the last 20 minutes' pace (null: too little recent data). */
  minutesLeft?: number | null;
  /** Why the downloader refused the last batch (e.g. the VPS isn't updated), or null. */
  refused: string | null;
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
  /** What the source has when the downloader could list fewer (Spotify: first 100). */
  sourceTotal: number | null;
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
