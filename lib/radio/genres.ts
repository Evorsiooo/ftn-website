// Detailed genres and the original release year from MusicBrainz (Adrien, 2026-11-25).
//
// MusicBrainz is free and needs no key, and its web service answers browsers directly (CORS), so the
// Library page looks songs up from the admin's own browser, only when "Find genres and original years" is
// pressed. Never on the VPS (it only downloads) and never on the website's server (one search a second
// per IP is MusicBrainz's rule; every admin's browser has its own).
//
// A song is matched to every MusicBrainz recording with the same name by the same main artist at about the
// same length. Several recordings usually exist (the single, the album, remasters, compilations): the
// earliest first release among them is the song's original year, where our release year is often a
// reissue's (Lovefool: 2024 instead of 1996). Genres come from the song itself when people have tagged it,
// else from its album, else from its artist (most voted first).

import { bare, guessTitleArtist, mainArtist, squash } from "./metadata";

const MB = "https://musicbrainz.org/ws/2";
/** MusicBrainz allows one request a second per IP; a little more keeps us clear of it. */
export const MB_GAP_MS = 1100;
const MAX_GENRES = 5;

export class MusicBrainzBusy extends Error {}

interface MbGenre {
  name: string;
  count: number;
}
interface MbRecording {
  id: string;
  score?: number;
  title: string;
  length?: number | null;
  "first-release-date"?: string;
  "artist-credit"?: { name: string; artist: { id: string; name: string } }[];
  releases?: { "release-group"?: { id: string; "primary-type"?: string; "secondary-types"?: string[] } }[];
}

export interface GenreLookup {
  /** Detailed genres, most voted first (empty: none known). */
  genres: string[];
  /** Where they came from: the song itself, its album or its artist. */
  from: "song" | "album" | "artist" | null;
  /** The earliest year any matching recording came out, or null. */
  originalYear: number | null;
}

/**
 * One request at a time, at most one per MB_GAP_MS, for everyone sharing [gate]. [headers]: the website's
 * server (the AI tool find_song_genres) names itself with a User-Agent, as MusicBrainz asks; a browser
 * sends its own and must not set one.
 */
export function mbGate(headers: Record<string, string> = {}) {
  let last = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return function get<T>(path: string, stop: { current: boolean }): Promise<T | null> {
    const run = chain.then(async () => {
      // 503 is MusicBrainz saying "slow down" (it also happens when the whole service is busy): wait 2, 4,
      // then 8 seconds and ask again; after that the caller pauses the run for a minute
      for (let attempt = 0; ; attempt++) {
        const wait = last + MB_GAP_MS - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        last = Date.now();
        if (stop.current) return null;
        const res = await fetch(`${MB}${path}${path.includes("?") ? "&" : "?"}fmt=json`, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(15_000) });
        if (res.status === 503 || res.status === 429) {
          if (attempt >= 3) throw new MusicBrainzBusy(`MusicBrainz ${res.status}`);
          last = Date.now() + 1000 * 2 ** (attempt + 1) - MB_GAP_MS;
          continue;
        }
        if (!res.ok) return null;
        return (await res.json().catch(() => null)) as T | null;
      }
    });
    chain = run.catch(() => undefined);
    return run;
  };
}
export type MbGet = ReturnType<typeof mbGate>;

/** Lucene's special characters, escaped for a quoted phrase. */
const phrase = (s: string) => `"${s.replace(/["\\]/g, "\\$&").trim()}"`;

// Genres a lone voter added next to well-voted ones ("alternative rock" on an *NSYNC song) are left out:
// only those with at least a third of the top genre's votes count.
const topGenres = (list: MbGenre[] | undefined) =>
  (list || [])
    .filter((g, _, all) => g.count > 0 && g.count * 3 >= Math.max(...all.map((x) => x.count)))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_GENRES)
    .map((g) => g.name.toLowerCase());

const yearOf = (d?: string) => {
  const y = d ? Number(d.slice(0, 4)) : NaN;
  return Number.isInteger(y) && y >= 1800 ? y : null;
};

/**
 * Detailed genres and the original year of [title] by [artist], or null when MusicBrainz doesn't have the song.
 * [artistGenres] caches artist lookups for the run (many songs share an artist). Takes 2 to 4 requests.
 */
export async function lookUpGenres(
  song: { title: string; artist: string; durationSec: number; metadataSource?: string | null },
  get: MbGet,
  stop: { current: boolean },
  artistGenres: Map<string, string[]>,
): Promise<GenreLookup | null> {
  const guess = guessTitleArtist({ title: song.title, artist: song.artist, durationSec: song.durationSec, metadataSource: (song.metadataSource as never) ?? null });
  const tries = [{ title: song.title, artist: song.artist }];
  if (guess.title !== song.title || guess.artist !== song.artist) tries.push({ title: guess.title, artist: guess.artist });

  let fits: MbRecording[] = [];
  for (const t of tries) {
    const want = bare(t.title);
    const who = mainArtist(t.artist);
    if (!want || !who) continue;
    const name = t.title.replace(/\s*[([【][^)\]】]*[)\]】]/g, "").trim() || t.title;
    const q = `recording:${phrase(name)} AND artist:${phrase(t.artist.split(/,|&|\s+x\s+|\bfeat\.?|\bft\.?/i)[0] || t.artist)}`;
    const found = await get<{ recordings?: MbRecording[] }>(`/recording?limit=25&query=${encodeURIComponent(q)}`, stop);
    fits = (found?.recordings || []).filter((r) => {
      if (bare(r.title) !== want) return false;
      const credit = r["artist-credit"] || [];
      const a = mainArtist(credit[0]?.name || "");
      const full = squash(credit.map((c) => c.name).join(" "));
      if (!(a === who || (who.length >= 3 && full.includes(who)) || (a.length >= 3 && squash(t.artist).includes(a)))) return false;
      // a live or extended version is another recording
      return !song.durationSec || !r.length || Math.abs(r.length / 1000 - song.durationSec) <= 15;
    });
    if (fits.length) break;
    if (stop.current) return null;
  }
  if (!fits.length) return null;

  const years = fits.map((r) => yearOf(r["first-release-date"])).filter((y): y is number => y !== null);
  const originalYear = years.length ? Math.min(...years) : null;

  // the best-scored recording's own tags first
  fits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const best = fits[0]!;
  const rec = await get<{ genres?: MbGenre[] }>(`/recording/${best.id}?inc=genres`, stop);
  let genres = topGenres(rec?.genres);
  if (genres.length) return { genres, from: "song", originalYear };

  // then the album it first came out on (an album over a single, a studio album over a compilation)
  const groups = fits.flatMap((r) => r.releases || []).map((x) => x["release-group"]).filter((g): g is NonNullable<typeof g> => !!g?.id);
  const rank = (g: (typeof groups)[number]) => (g["primary-type"] === "Album" ? 0 : g["primary-type"] === "Single" ? 1 : 2) + ((g["secondary-types"] || []).length ? 3 : 0);
  const group = groups.sort((a, b) => rank(a) - rank(b))[0];
  if (group && !stop.current) {
    const rg = await get<{ genres?: MbGenre[] }>(`/release-group/${group.id}?inc=genres`, stop);
    genres = topGenres(rg?.genres);
    if (genres.length) return { genres, from: "album", originalYear };
  }

  // then the artist (cached for the run)
  const artistId = best["artist-credit"]?.[0]?.artist.id;
  if (artistId && !stop.current) {
    if (!artistGenres.has(artistId)) {
      const a = await get<{ genres?: MbGenre[] }>(`/artist/${artistId}?inc=genres`, stop);
      if (a) artistGenres.set(artistId, topGenres(a.genres));
    }
    genres = artistGenres.get(artistId) || [];
    if (genres.length) return { genres, from: "artist", originalYear };
  }
  return { genres: [], from: null, originalYear };
}

/** The stored JSON array of detailed genres as a list (empty when none or unreadable). */
export function parseGenres(stored: string | null | undefined): string[] {
  if (!stored) return [];
  try {
    const v = JSON.parse(stored);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
