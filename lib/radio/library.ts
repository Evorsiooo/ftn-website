import type { LibrarySong } from "./autodj";

// PLACEHOLDER until the library branch (radio_songs, migration 0025) is
// combined with this one: that branch's lib/radio/library.ts replaces this
// file with the same two functions. Until the table exists (previews share
// the production database, which has no migration yet) it falls back to the
// lab's five test songs in the bucket.

type Row = { r2_key: string; title: string; artist: string; duration_sec: number | null; loudness_db: number | null; thumbnail_url: string | null };
const toSong = (r: Row): LibrarySong => ({
  key: r.r2_key,
  title: r.title,
  artist: r.artist,
  durationSec: r.duration_sec,
  loudnessDb: r.loudness_db,
  thumbnail: r.thumbnail_url,
});

async function testSongs(): Promise<LibrarySong[]> {
  const bucket = (process.env as unknown as { ftn_radio?: R2Bucket }).ftn_radio;
  const obj = bucket ? await bucket.get("test/songs.json") : null;
  return obj ? ((await obj.json()) as LibrarySong[]) : [];
}

/** The songs the AutoDJ may play (not archived). */
export async function listAutoDjSongs(db: D1Database): Promise<LibrarySong[]> {
  try {
    const { results } = await db
      .prepare("SELECT r2_key, title, artist, duration_sec, loudness_db, thumbnail_url FROM radio_songs WHERE in_autodj = 1 AND archived_at IS NULL")
      .all<Row>();
    return results.map(toSong);
  } catch {
    return testSongs();
  }
}

/** The library's songs with these R2 keys (for checking listeners' writes). */
export async function songsByKeys(db: D1Database, keys: string[]): Promise<Map<string, LibrarySong>> {
  const unique = [...new Set(keys)].slice(0, 50);
  if (!unique.length) return new Map();
  try {
    const { results } = await db
      .prepare(`SELECT r2_key, title, artist, duration_sec, loudness_db, thumbnail_url FROM radio_songs WHERE r2_key IN (${unique.map(() => "?").join(",")})`)
      .bind(...unique)
      .all<Row>();
    return new Map(results.map((r) => [r.r2_key, toSong(r)]));
  } catch {
    const all = await testSongs();
    return new Map(all.filter((s) => unique.includes(s.key)).map((s) => [s.key, s]));
  }
}
