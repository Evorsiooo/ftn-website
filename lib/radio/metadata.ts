// Better song names, artists, albums and album art than a YouTube video gives.
//
// A plain YouTube video only has the uploader's channel and the video's title ("Tori Amos - Cornflake
// Girl (US Version) (Official Music Video)" by "UPROXX Indie Mixtape"). The downloader says how sure its
// fields are (metadataSource); the unsure ones are split and cleaned here when a song is recorded, and the
// library page then looks each song up in Apple's public music catalog (iTunes Search) for the exact name,
// artist, album and a square cover (components/admin/radio-library/metadata-check.tsx). Never on the VPS.

const squash = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");

/** What the downloader stores about a song (download-api.md). Songs from before 2026-11-15 only have title and artist. */
export interface SongFacts {
  title: string;
  artist: string;
  album?: string | null;
  releaseYear?: number | null;
  durationSec: number;
  thumbnail?: string | null;
  metadataSource?: "tagged" | "topic-channel" | "spotify" | "video" | null;
  track?: string | null;
  artists?: string[] | null;
  rawTitle?: string | null;
  channel?: string | null;
}

// Bracketed extras that aren't part of a song's name.
const JUNK =
  /official|music video|\bvideo\b|\baudio\b|lyrics?|\bversion\b|visuali[sz]er|\bhd\b|\bhq\b|\b4k\b|\b1080p\b|\bmv\b|\bm\/v\b|remaster|upgrade|explicit|clean|radio edit|\blive\b|full song|color coded|\bsub\b|español|legendado/i;
const BRACKETS = /\s*[([【]([^)\]】]*)[)\]】]/g;

/** "Cornflake Girl (US Version) (Official Music Video) [HD]" -> "Cornflake Girl". Keeps "(feat. X)" and remix names. */
export function cleanTitle(title: string): string {
  let t = title.replace(BRACKETS, (whole, inner: string) => (JUNK.test(inner) && !/remix|feat|ft\.|with /i.test(inner) ? "" : whole));
  // trailing extras without brackets: "Song | Official Video", "Song - Lyrics", "Song // HD"
  t = t.replace(/\s*(\||\/\/)\s*.*$/, "");
  t = t.replace(/\s+[-–—]\s+(official.*|lyrics?|audio|hd|4k|video)$/i, "");
  t = t.replace(/["“”]/g, "");
  return t.replace(/\s{2,}/g, " ").trim() || title.trim();
}

/** "X - Topic", "XVEVO", "X Official" -> "X". */
function channelName(channel: string): string {
  return channel
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .replace(/\s+(official|music|tv)$/i, "")
    .trim();
}

/**
 * The best title and artist the downloader's fields allow, before any catalog lookup.
 * tagged and spotify are trusted; topic-channel trusts the artist; video splits "Artist - Title".
 */
export function guessTitleArtist(s: SongFacts): { title: string; artist: string; sure: boolean } {
  const source = s.metadataSource || "video";
  if (source === "tagged" || source === "spotify") return { title: s.title, artist: s.artist, sure: true };
  if (source === "topic-channel") return { title: cleanTitle(s.track || s.title), artist: s.artist, sure: false };
  const raw = s.rawTitle || s.title;
  const uploader = channelName(s.channel || s.artist || "");
  // "Artist | Title (Official Audio)": a bar after the uploader's own name separates it from the song
  const bar = raw.match(/^(.+?)\s+\|\s+(.+)$/);
  if (bar && squash(uploader) && squash(bar[1]) === squash(uploader)) return { title: cleanTitle(bar[2]), artist: uploader, sure: false };
  const dash = raw.match(/^(.+?)\s+[-–—~]\s+(.+)$/);
  if (dash) {
    // "Artist - Title" (the usual), unless the left side looks like the song and the right the uploader
    const [, left, right] = dash;
    if (squash(uploader) && squash(right) === squash(uploader)) return { title: cleanTitle(left), artist: uploader, sure: false };
    return { title: cleanTitle(right), artist: cleanTitle(left), sure: false };
  }
  return { title: cleanTitle(raw), artist: uploader || s.artist, sure: false };
}

// ---------- catalog ----------

export interface ITunesTrack {
  trackName: string;
  artistName: string;
  collectionName?: string;
  releaseDate?: string;
  trackTimeMillis?: number;
  artworkUrl100?: string;
  collectionArtistName?: string;
}

/** The song's own name for comparing: no brackets, no " - Remastered 2011", no "feat.". */
const bare = (t: string) =>
  squash(
    t
      .replace(BRACKETS, "")
      .replace(/\s+[-–—]\s+.*(remaster|version|edit|mix|mono|stereo|live).*$/i, "")
      .replace(/\s(feat|ft|featuring)\.?\s.*$/i, "")
  );
const mainArtist = (a: string) => squash(a.split(/,|&|\s+x\s+|\s+and\s+|\bfeat\.?|\bft\.?|\bfeaturing\b/i)[0] || a);
const COMPILATION = /greatest hits|best of|collection|anthology|essential|hits\b|now that's|the very best|playlist|karaoke|tribute|workout|party|originals|\bgold\b|platinum|singles|\d0'?s\b|classics|love songs|summer|christmas/i;

const EXTRA = /remaster|deluxe|edition|anniversary|remix|\bmono\b|- single|- ep\b|expanded|version/i;
/** "Under the Pink (Deluxe Edition)" -> "Under the Pink"; "Cornflake Girl (2015 Remastered)" -> "Cornflake Girl". */
export const tidyName = (name: string) =>
  name
    .replace(/\s*[([][^)\]]*(remaster|deluxe|edition|anniversary|expanded)[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+(single|ep)$/i, "")
    .replace(/\s+-\s+.*remaster.*$/i, "")
    .trim() || name;

export class CatalogError extends Error {}

async function itunes(term: string): Promise<ITunesTrack[]> {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term, entity: "song", limit: "15", media: "music" })}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  // Apple allows roughly 20 searches a minute: a refusal means "try later", not "not found"
  if (res.status === 403 || res.status === 429 || res.status >= 500) throw new CatalogError(`iTunes ${res.status}`);
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { results?: ITunesTrack[] } | null;
  return Array.isArray(body?.results) ? body!.results : [];
}

/**
 * The catalog's version of [title] by [artist]: same song name, same main artist (either way round,
 * so "Mark Ronson" finds "Mark Ronson feat. Bruno Mars"), and about the same length. The original album
 * wins over compilations, and the earliest release over re-releases.
 */
export async function findInCatalog(title: string, artist: string, durationSec: number): Promise<ITunesTrack | null> {
  const want = bare(title);
  const who = mainArtist(artist);
  if (!want) return null;
  const results = await itunes(`${artist} ${title.replace(BRACKETS, "")}`.slice(0, 200));
  const fits = results.filter((r) => {
    if (!r.trackName || !r.artistName) return false;
    if (bare(r.trackName) !== want) return false;
    const a = mainArtist(r.artistName);
    const full = squash(r.artistName);
    if (!(a === who || (who.length >= 3 && full.includes(who)) || (a.length >= 3 && squash(artist).includes(a)))) return false;
    // a known length must agree (a live or extended version is another recording)
    return !durationSec || !r.trackTimeMillis || Math.abs(r.trackTimeMillis / 1000 - durationSec) <= 12;
  });
  if (!fits.length) return null;
  // the plain recording on its album first; then singles, remasters and deluxe editions; compilations last
  const rank = (r: ITunesTrack) =>
    (COMPILATION.test(r.collectionName || "") || (r.collectionArtistName && r.collectionArtistName !== r.artistName) ? 4 : 0) + (EXTRA.test(r.collectionName || "") ? 2 : 0) + (EXTRA.test(r.trackName) ? 1 : 0);
  fits.sort((a, b) => rank(a) - rank(b) || (a.releaseDate || "9").localeCompare(b.releaseDate || "9"));
  return fits[0]!;
}
