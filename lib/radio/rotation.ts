// The radio's rotation rules (Adrien, 2026-11-25): how soon a song, an artist or an album may come back,
// which of the AutoDJ's best matches plays, and how the website checks a song it is sent. Shared by the
// listeners' browsers (radio-engine) and the website, so only relative imports.
//
// - No song again within REPEAT_WINDOW (200) songs, on every path: the AutoDJ's pick, the first song
//   after a quiet spell, a skip in the Studio. The website refuses a song that breaks it (repeatProblem).
//   Exceptions: a song a broadcaster queued, and a playlist show's own songs, which follow the
//   playlist's shuffle instead (each song once per round, see programPick).
// - Artists: none again within ARTIST_GAP songs, relaxed to ARTIST_GAP_MIN and then dropped only when
//   nothing else is left. Albums: at most ALBUM_RUN songs in a row from one album.
// - AutoMix ranks the songs; one of its TOP_MATCHES best plays (AutoMix itself always plays the first),
//   drawn with a random seeded by the song's number, so every listener's browser draws the same one.

import { airingAt, type RadioProgram } from './program-types';
import { firstNewItem, slotAt, type PlaylistProgress, type RadioTimeline } from './autodj';

export { REPEAT_WINDOW, repeatWindow } from './autodj';

export const ARTIST_GAP = 8;
export const ARTIST_GAP_MIN = 6;
export const ALBUM_RUN = 2;
export const TOP_MATCHES = 3;
/** Sent with each change by browsers that follow these rules (RadioTimeline.picker). */
export const ROTATION_VERSION = 2;
/** A playlist's progress is forgotten after this long without the show airing. */
const PLAYLIST_PROGRESS_TTL_MS = 120 * 86_400_000;

interface SongInfo {
  artist: string;
  album?: string | null;
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
/** The main artist: "A, B", "A & B", "A feat. B", "A x B" all count as A. */
export function mainArtist(artist: string | null | undefined): string {
  return norm(norm(artist).split(/\s*(?:,|&|;|\/|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\sx\s|\sand\s)\s*/)[0]);
}

/**
 * [candidates] (best first) that the artist and album rules allow after [history] (song keys, most recent
 * first, lined-up songs included). Relaxed step by step rather than leaving nothing to play.
 */
export function rotationFilter<T>(candidates: T[], keyOf: (c: T) => string, history: string[], songs: Map<string, SongInfo>): T[] {
  const artistOf = (key: string) => mainArtist(songs.get(key)?.artist);
  const albumOf = (key: string) => norm(songs.get(key)?.album);
  const run = history.slice(0, ALBUM_RUN).map(albumOf);
  const fullAlbum = run.length === ALBUM_RUN && run[0] && run.every((a) => a === run[0]) ? run[0] : null;
  const albumOk = (c: T) => !fullAlbum || albumOf(keyOf(c)) !== fullAlbum;
  for (const gap of [ARTIST_GAP, ARTIST_GAP_MIN, 0]) {
    const artists = new Set(history.slice(0, gap).map(artistOf).filter(Boolean));
    const ok = candidates.filter((c) => albumOk(c) && !artists.has(artistOf(keyOf(c))));
    if (ok.length) return ok;
  }
  return candidates;
}

/** One of the first TOP_MATCHES of [ranked], drawn with [rand] (seeded: the same in every browser). */
export function pickTop<T>(ranked: T[], rand: () => number): T | undefined {
  const top = ranked.slice(0, TOP_MATCHES);
  return top[Math.floor(rand() * top.length)];
}

// ---- What the website checks ----------------------------------------------------------------------------

/** A playlist show's songs that may still play in its current round. */
function playlistAllows(p: PlaylistProgress | undefined, list: string[], key: string): boolean {
  if (!list.includes(key)) return false;
  if (!p) return true;
  const played = new Set(p.played);
  return list.every((k) => played.has(k)) || !played.has(key);
}

/**
 * The playlist airings that song [i] of [tl] counts for: the one on when the song before it ends (the
 * moment the browsers' programPick looks at), and the one on when it starts mixing in, which differ only
 * at a show's edges.
 */
function playlistAirings(tl: RadioTimeline, i: number, program: RadioProgram | null) {
  const k = tl.firstK + i;
  const times = [slotAt(tl, k - 1)?.endMs, slotAt(tl, k)?.startMs].filter((t): t is number => t !== undefined);
  const out = times.map((t) => airingAt(program, t)).filter((a) => a?.plays === 'playlist' && !!a.playlist);
  return [...new Set(out)] as NonNullable<ReturnType<typeof airingAt>>[];
}

export interface Repeat {
  key: string;
  /** How many songs ago it last played (0: the one just before). */
  ago: number;
}

/**
 * The new songs of [stored] (already through withPlayed, so its `played` is the history before them)
 * that played less than REPEAT_WINDOW songs ago, leaving out a broadcaster's queued songs and a
 * playlist show's songs while its round allows them. The caller shrinks the window for a small library.
 */
export function repeatProblem(current: RadioTimeline | null, stored: RadioTimeline, nowMs: number, program: RadioProgram | null): Repeat[] {
  const from = firstNewItem(current, stored, nowMs);
  const out: Repeat[] = [];
  for (let i = from; i < stored.items.length; i++) {
    const key = stored.items[i]!.key;
    const history = [...stored.items.slice(0, i).map((it) => it.key).reverse(), ...(stored.played ?? [])];
    const ago = history.indexOf(key);
    if (ago < 0) continue;
    if (program?.studio?.queue.includes(key)) continue;
    if (playlistAirings(stored, i, program).some((a) => playlistAllows(stored.playlists?.[a.playlistId ?? a.id], a.playlist!, key))) continue;
    out.push({ key, ago });
  }
  return out;
}

/**
 * [stored] with its playlist shows' progress brought up to date: each new song that a playlist show
 * airing as it starts has in its list counts toward that playlist's round; a round that had played
 * every song starts a new one (a new shuffle).
 */
export function withPlaylistPlays(current: RadioTimeline | null, stored: RadioTimeline, nowMs: number, program: RadioProgram | null): RadioTimeline {
  const progress: Record<string, PlaylistProgress> = {};
  for (const [id, p] of Object.entries(stored.playlists ?? {})) if (nowMs - p.at < PLAYLIST_PROGRESS_TTL_MS) progress[id] = p;
  if (program?.airings.some((a) => a.plays === 'playlist')) {
    for (let i = firstNewItem(current, stored, nowMs); i < stored.items.length; i++) {
      const key = stored.items[i]!.key;
      const a = playlistAirings(stored, i, program).find((x) => x.playlist!.includes(key));
      if (!a) continue;
      const id = a.playlistId ?? a.id;
      let p = progress[id] ?? { cycle: 0, played: [], at: nowMs };
      const played = new Set(p.played);
      if (a.playlist!.every((k) => played.has(k))) p = { cycle: p.cycle + 1, played: [], at: nowMs };
      if (!p.played.includes(key)) p = { ...p, played: [...p.played, key], at: nowMs };
      progress[id] = p;
    }
  }
  return { ...stored, playlists: progress };
}

/**
 * The key of a new song of [stored] that takes the place the website had picked a song for (current.nextPick)
 * without being that song, or null. A show's song may take it: a broadcaster's queued song, or one a playlist
 * show airing then allows.
 */
export function notThePick(current: RadioTimeline | null, stored: RadioTimeline, nowMs: number, program: RadioProgram | null): string | null {
  const p = current?.nextPick;
  if (!p) return null;
  const i = p.k - stored.firstK;
  if (i < firstNewItem(current, stored, nowMs) || i < 1 || i >= stored.items.length) return null;
  if (stored.items[i - 1]!.key !== p.after) return null;
  const key = stored.items[i]!.key;
  if (key === p.key || program?.studio?.queue.includes(key)) return null;
  if (playlistAirings(stored, i, program).some((a) => playlistAllows(stored.playlists?.[a.playlistId ?? a.id], a.playlist!, key))) return null;
  return key;
}
