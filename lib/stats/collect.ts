import { slotAt, slotIndexAt, type RadioTimeline } from "@/lib/radio/autodj";
import { AUTODJ_KEY, radioBucket } from "@/lib/radio/store";

/*
 * Statistics collection (admin Stats page). The every-minute cron Worker calls /api/stats/cron every
 * 5 minutes; that saves the listener count and the songs that started since the last run. Days are UTC.
 */

/** A listener counts as listening if their player checked in within this long (same as /api/radio/time). */
export const ON_AIR_SEC = 11 * 60;
export const SNAPSHOT_SEC = 300;

export const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

/** Saves how many people listen now, and logs the songs that started since the last run. */
export async function snapshot(db: D1Database, now = Date.now()): Promise<{ listeners: number; plays: number }> {
  const sec = Math.floor(now / 1000);
  const row = await db.prepare("SELECT COUNT(*) AS n FROM radio_listeners WHERE seen_at > ?").bind(sec - ON_AIR_SEC).first<{ n: number }>();
  const listeners = row?.n ?? 0;
  const at = Math.floor(sec / SNAPSHOT_SEC) * SNAPSHOT_SEC;
  const stmts = [db.prepare("INSERT OR REPLACE INTO stat_listeners (at, n) VALUES (?, ?)").bind(at, listeners)];

  const plays = await startedSongs(db, now);
  for (const p of plays) {
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO stat_song_plays (at, song_key, title, artist, listeners) VALUES (?, ?, ?, ?, ?)")
        .bind(p.at, p.key, p.title.slice(0, 300), p.artist.slice(0, 300), listeners),
    );
  }
  // once a day, forget per-listener day rows older than a year (the counts per day stay in the page's queries)
  if (at % 86_400 === 0) stmts.push(db.prepare("DELETE FROM stat_listener_days WHERE day < ?").bind(utcDay(now - 400 * 86_400_000)));
  await db.batch(stmts);
  return { listeners, plays: plays.length };
}

/** Songs in the AutoDJ's running order that started after the last logged one (at most 30 minutes back). */
async function startedSongs(db: D1Database, now: number) {
  const obj = await radioBucket()?.get(AUTODJ_KEY);
  if (!obj) return [];
  const tl = (await obj.json().catch(() => null)) as RadioTimeline | null;
  if (!tl?.items?.length) return [];
  const last = await db.prepare("SELECT MAX(at) AS at FROM stat_song_plays").first<{ at: number | null }>();
  const since = Math.max(last?.at ?? 0, now - 30 * 60_000);
  const out: { at: number; key: string; title: string; artist: string }[] = [];
  let k = slotIndexAt(tl, now);
  for (let guard = 0; k !== null && guard < 30; guard++, k--) {
    const slot = slotAt(tl, k);
    if (!slot || slot.startMs <= since) break;
    if (slot.startMs <= now) out.push({ at: Math.round(slot.startMs), key: slot.item.key, title: slot.item.title, artist: slot.item.artist });
  }
  return out;
}
