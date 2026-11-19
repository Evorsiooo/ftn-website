import { CAP_BYTES } from "@/lib/radio/rtc";

/*
 * The admin Stats page's numbers, one function per tab. Each tab is a single D1 batch (one round trip), so
 * the database does the counting and the Worker only reshapes small result sets. Days are UTC.
 */

export type Range = { days: number; sinceSec: number; nowSec: number };

export function rangeOf(days: number, now = Date.now()): Range {
  const nowSec = Math.floor(now / 1000);
  return { days, sinceSec: nowSec - days * 86_400, nowSec };
}

/** Bucket size for the listener graph: 5 minutes for a day, hourly for a week, 3 hours for a month, daily beyond. */
export function listenerBucket(days: number): number {
  if (days <= 1) return 300;
  if (days <= 7) return 3600;
  if (days <= 30) return 3 * 3600;
  return 86_400;
}

const dayOf = (col: string) => `strftime('%Y-%m-%d', ${col}, 'unixepoch')`;
const rows = <T>(r: D1Result<unknown>) => (r.results ?? []) as T[];

export async function radioStats(db: D1Database, r: Range) {
  const b = listenerBucket(r.days);
  const sinceMs = r.sinceSec * 1000;
  const nowMs = r.nowSec * 1000;
  const sinceDay = new Date(sinceMs).toISOString().slice(0, 10);
  const res = await db.batch([
    // b is one of four whole numbers, written into the SQL so the division stays an integer one (bound numbers are REAL)
    db.prepare(`SELECT (at / ${b}) * ${b} AS t, AVG(n) AS avg, MAX(n) AS peak FROM stat_listeners WHERE at >= ? GROUP BY t ORDER BY t`).bind(r.sinceSec),
    db.prepare(`SELECT MAX(n) AS peak, AVG(n) AS avg, SUM(n) * 5.0 / 60 AS hours, COUNT(*) AS samples FROM stat_listeners WHERE at >= ?`).bind(r.sinceSec),
    db.prepare(`SELECT at FROM stat_listeners WHERE at >= ? ORDER BY n DESC, at DESC LIMIT 1`).bind(r.sinceSec),
    db.prepare(`SELECT day, COUNT(*) AS n FROM stat_listener_days WHERE day >= ? GROUP BY day ORDER BY day`).bind(sinceDay),
    db.prepare(`SELECT COUNT(DISTINCT id) AS n FROM stat_listener_days WHERE day >= ?`).bind(sinceDay),
    db.prepare(`SELECT ${dayOf("at")} AS day, SUM(n) * 5.0 / 60 AS hours FROM stat_listeners WHERE at >= ? GROUP BY day ORDER BY day`).bind(r.sinceSec),
    db.prepare(`SELECT song_key AS key, MAX(title) AS title, MAX(artist) AS artist, COUNT(*) AS plays, SUM(COALESCE(listeners, 0)) AS heard FROM stat_song_plays WHERE at >= ? GROUP BY song_key ORDER BY plays DESC, heard DESC LIMIT 10`).bind(sinceMs),
    db.prepare(`SELECT artist, COUNT(*) AS plays, COUNT(DISTINCT song_key) AS songs FROM stat_song_plays WHERE at >= ? GROUP BY artist ORDER BY plays DESC LIMIT 10`).bind(sinceMs),
    db.prepare(`SELECT at, title, artist, listeners FROM stat_song_plays WHERE at >= ? ORDER BY at DESC LIMIT 12`).bind(sinceMs),
    db.prepare(`SELECT COUNT(*) AS plays FROM stat_song_plays WHERE at >= ?`).bind(sinceMs),
    // votes
    db.prepare(`SELECT ${dayOf("updated_at")} AS day, SUM(value = 1) AS up, SUM(value = -1) AS down FROM song_votes WHERE updated_at >= ? GROUP BY day ORDER BY day`).bind(r.sinceSec),
    db.prepare(`SELECT song_key AS key, MAX(title) AS title, MAX(artist) AS artist, SUM(value) AS score, COUNT(*) AS votes FROM song_votes GROUP BY song_key HAVING votes >= 2 ORDER BY score DESC, votes DESC LIMIT 5`),
    db.prepare(`SELECT song_key AS key, MAX(title) AS title, MAX(artist) AS artist, SUM(value) AS score, COUNT(*) AS votes FROM song_votes GROUP BY song_key HAVING votes >= 2 AND score < 0 ORDER BY score ASC, votes DESC LIMIT 5`),
    // shows: each replay (a Studio show or an automated show), with its listeners and callers
    db.prepare(
      `SELECT r.id, r.kind, r.title, r.started_at AS startedAt, r.ended_at AS endedAt,
        (SELECT MAX(n) FROM stat_listeners WHERE at BETWEEN r.started_at / 1000 AND COALESCE(r.ended_at, ?2) / 1000) AS peak,
        (SELECT AVG(n) FROM stat_listeners WHERE at BETWEEN r.started_at / 1000 AND COALESCE(r.ended_at, ?2) / 1000) AS avg,
        (SELECT COUNT(DISTINCT p.user_id) FROM radio_studio_sessions s JOIN radio_studio_people p ON p.session_id = s.id AND p.role = 'caller' WHERE s.replay_id = r.id) AS callers
       FROM radio_replays r WHERE r.started_at >= ?1 AND r.started_at <= ?2 ORDER BY r.started_at DESC LIMIT 40`,
    ).bind(sinceMs, nowMs),
    // library
    db.prepare(`SELECT ${dayOf("created_at")} AS day, COUNT(*) AS n FROM radio_songs WHERE created_at >= ? GROUP BY day ORDER BY day`).bind(r.sinceSec),
    db.prepare(`SELECT SUM(archived = 0) AS active, COUNT(*) AS total, SUM(CASE WHEN archived = 0 THEN duration_sec ELSE 0 END) AS seconds FROM radio_songs`),
    db.prepare(`SELECT state, COUNT(*) AS n, SUM(failed) AS songsFailed, SUM(done) AS songsDone FROM radio_imports WHERE created_at >= ? GROUP BY state`).bind(r.sinceSec),
    db.prepare(`SELECT id, url, title, error, created_at AS createdAt FROM radio_imports WHERE created_at >= ? AND (state = 'failed' OR failed > 0) ORDER BY created_at DESC LIMIT 5`).bind(r.sinceSec),
    db.prepare(`SELECT month, bytes FROM radio_rtc_usage ORDER BY month DESC LIMIT 1`),
  ]);
  const [series, totals, peakAt, uniqueDays, unique, hoursDays, topSongs, topArtists, recent, playCount, voteDays, best, worst, shows, added, library, imports, failedImports, rtc] = res;
  const t = rows<{ peak: number | null; avg: number | null; hours: number | null; samples: number }>(totals)[0];
  return {
    bucketSec: b,
    listeners: rows<{ t: number; avg: number; peak: number }>(series).map((x) => ({ t: x.t * 1000, avg: Math.round(x.avg * 10) / 10, peak: x.peak })),
    peak: t?.peak ?? 0,
    peakAt: (rows<{ at: number }>(peakAt)[0]?.at ?? 0) * 1000 || null,
    average: Math.round((t?.avg ?? 0) * 10) / 10,
    hours: Math.round((t?.hours ?? 0) * 10) / 10,
    samples: t?.samples ?? 0,
    uniqueDays: rows<{ day: string; n: number }>(uniqueDays),
    unique: rows<{ n: number }>(unique)[0]?.n ?? 0,
    hoursDays: rows<{ day: string; hours: number }>(hoursDays).map((x) => ({ day: x.day, hours: Math.round(x.hours * 10) / 10 })),
    topSongs: rows<{ key: string; title: string; artist: string; plays: number; heard: number }>(topSongs),
    topArtists: rows<{ artist: string; plays: number; songs: number }>(topArtists),
    recent: rows<{ at: number; title: string; artist: string; listeners: number | null }>(recent),
    plays: rows<{ plays: number }>(playCount)[0]?.plays ?? 0,
    voteDays: rows<{ day: string; up: number; down: number }>(voteDays),
    best: rows<{ key: string; title: string; artist: string; score: number; votes: number }>(best),
    worst: rows<{ key: string; title: string; artist: string; score: number; votes: number }>(worst),
    shows: rows<{ id: string; kind: string; title: string; startedAt: number; endedAt: number | null; peak: number | null; avg: number | null; callers: number }>(shows),
    added: rows<{ day: string; n: number }>(added),
    library: rows<{ active: number; total: number; seconds: number }>(library)[0] ?? { active: 0, total: 0, seconds: 0 },
    imports: rows<{ state: string; n: number; songsFailed: number; songsDone: number }>(imports),
    failedImports: rows<{ id: string; url: string; title: string | null; error: string | null; createdAt: number }>(failedImports),
    rtc: { ...(rows<{ month: string; bytes: number }>(rtc)[0] ?? { month: null, bytes: 0 }), capBytes: CAP_BYTES },
  };
}

export async function siteStats(db: D1Database, r: Range) {
  const res = await db.batch([
    db.prepare(`SELECT ${dayOf("published_at")} AS day, COUNT(*) AS n FROM articles WHERE status = 'published' AND published_at >= ? GROUP BY day ORDER BY day`).bind(r.sinceSec),
    db.prepare(`SELECT COUNT(*) AS n FROM articles WHERE status = 'published'`),
    db.prepare(
      `SELECT a.slug, a.title, COUNT(c.id) AS comments FROM comments c JOIN articles a ON a.id = c.article_id
       WHERE c.created_at >= ? GROUP BY a.id ORDER BY comments DESC LIMIT 8`,
    ).bind(r.sinceSec),
    db.prepare(`SELECT COUNT(*) AS n FROM comments WHERE created_at >= ?`).bind(r.sinceSec),
    db.prepare(`SELECT ${dayOf("created_at")} AS day, COUNT(*) AS n FROM tips WHERE created_at >= ? GROUP BY day ORDER BY day`).bind(r.sinceSec),
    db.prepare(`SELECT ${dayOf("created_at")} AS day, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY day ORDER BY day`).bind(r.sinceSec),
    db.prepare(`SELECT COUNT(*) AS n FROM users`),
    db.prepare(`SELECT slug, title FROM articles WHERE status = 'published'`),
  ]);
  const [published, publishedAll, commented, commentCount, tips, signups, usersAll, slugs] = res;
  return {
    published: rows<{ day: string; n: number }>(published),
    publishedAll: rows<{ n: number }>(publishedAll)[0]?.n ?? 0,
    commented: rows<{ slug: string; title: string; comments: number }>(commented),
    comments: rows<{ n: number }>(commentCount)[0]?.n ?? 0,
    tips: rows<{ day: string; n: number }>(tips),
    signups: rows<{ day: string; n: number }>(signups),
    usersAll: rows<{ n: number }>(usersAll)[0]?.n ?? 0,
    titles: Object.fromEntries(rows<{ slug: string; title: string }>(slugs).map((a) => [a.slug, a.title])) as Record<string, string>,
  };
}

export async function plusStats(db: D1Database, r: Range) {
  const sinceDay = new Date(r.sinceSec * 1000).toISOString().slice(0, 10);
  const res = await db.batch([
    db.prepare(`SELECT ${dayOf("viewed_at")} AS day, COUNT(*) AS n FROM video_views WHERE viewed_at >= ? GROUP BY day ORDER BY day`).bind(r.sinceSec),
    db.prepare(
      `SELECT v.youtube_id AS youtubeId, v.title, v.channel_title AS channel, v.thumbnail_url AS thumb, COUNT(*) AS views
       FROM video_views w JOIN videos v ON v.id = w.video_id WHERE w.viewed_at >= ? GROUP BY v.id ORDER BY views DESC LIMIT 10`,
    ).bind(r.sinceSec),
    db.prepare(`SELECT day, SUM(seconds) / 3600.0 AS hours, SUM(sessions) AS sessions FROM stat_watch_days WHERE day >= ? GROUP BY day ORDER BY day`).bind(sinceDay),
    db.prepare(
      `SELECT w.youtube_id AS youtubeId, MAX(v.title) AS title, SUM(w.seconds) / 3600.0 AS hours, SUM(w.sessions) AS sessions,
        SUM(w.q25) AS q25, SUM(w.q50) AS q50, SUM(w.q75) AS q75, SUM(w.q100) AS q100, MAX(v.duration_seconds) AS duration
       FROM stat_watch_days w LEFT JOIN videos v ON v.youtube_id = w.youtube_id WHERE w.day >= ? GROUP BY w.youtube_id ORDER BY hours DESC LIMIT 10`,
    ).bind(sinceDay),
    db.prepare(`SELECT SUM(sessions) AS sessions, SUM(seconds) / 3600.0 AS hours, SUM(q25) AS q25, SUM(q50) AS q50, SUM(q75) AS q75, SUM(q100) AS q100 FROM stat_watch_days WHERE day >= ?`).bind(sinceDay),
    db.prepare(`SELECT ${dayOf("at")} AS day, SUM(n) * 5.0 / 60 AS hours FROM stat_listeners WHERE at >= ? GROUP BY day ORDER BY day`).bind(r.sinceSec),
    db.prepare(`SELECT COUNT(*) AS n FROM video_views WHERE viewed_at >= ?`).bind(r.sinceSec),
  ]);
  const [viewDays, topVideos, watchDays, topWatched, watchTotals, radioDays, viewCount] = res;
  const wt = rows<{ sessions: number | null; hours: number | null; q25: number; q50: number; q75: number; q100: number }>(watchTotals)[0];
  return {
    viewDays: rows<{ day: string; n: number }>(viewDays),
    views: rows<{ n: number }>(viewCount)[0]?.n ?? 0,
    topVideos: rows<{ youtubeId: string; title: string; channel: string; thumb: string; views: number }>(topVideos),
    watchDays: rows<{ day: string; hours: number; sessions: number }>(watchDays),
    topWatched: rows<{ youtubeId: string; title: string | null; hours: number; sessions: number; q25: number; q50: number; q75: number; q100: number; duration: number | null }>(topWatched),
    watch: { sessions: wt?.sessions ?? 0, hours: wt?.hours ?? 0, q25: wt?.q25 ?? 0, q50: wt?.q50 ?? 0, q75: wt?.q75 ?? 0, q100: wt?.q100 ?? 0 },
    radioDays: rows<{ day: string; hours: number }>(radioDays),
  };
}

export async function postStats(db: D1Database, r: Range, withAds: boolean) {
  const sinceDay = new Date(r.sinceSec * 1000).toISOString().slice(0, 10);
  const posts = [
    db.prepare(`SELECT ${dayOf("created_at")} AS day, COUNT(*) AS n FROM posts WHERE status != 'draft' AND created_at >= ? GROUP BY day ORDER BY day`).bind(r.sinceSec),
    db.prepare(`SELECT status, COUNT(*) AS n FROM posts WHERE status != 'draft' AND created_at >= ? GROUP BY status`).bind(r.sinceSec),
    db.prepare(`SELECT ro_state AS state, COUNT(*) AS n, SUM(status = 'approved') AS approved FROM posts WHERE status != 'draft' AND created_at >= ? GROUP BY ro_state ORDER BY n DESC`).bind(r.sinceSec),
    db.prepare(
      `SELECT u.display_name AS name, u.roblox_username AS username, u.avatar_url AS avatar, COUNT(*) AS n, SUM(p.status = 'approved') AS approved, SUM(p.status = 'denied') AS denied
       FROM posts p JOIN users u ON u.id = p.created_by WHERE p.status != 'draft' AND p.created_at >= ? GROUP BY p.created_by ORDER BY n DESC LIMIT 15`,
    ).bind(r.sinceSec),
    // waiting time: from sending (or the scheduled time, when later) to the decision
    db.prepare(
      `SELECT decided_at - MAX(created_at, COALESCE(scheduled_at, 0)) AS wait FROM posts WHERE status IN ('approved', 'denied') AND decided_at IS NOT NULL AND created_at >= ? ORDER BY wait`,
    ).bind(r.sinceSec),
  ];
  const ads = withAds
    ? [
        db.prepare(`SELECT day, SUM(impressions) AS views, SUM(clicks) AS clicks FROM stat_ad_days WHERE day >= ? GROUP BY day ORDER BY day`).bind(sinceDay),
        db.prepare(
          `SELECT o.id, o.name, o.logo_url AS logo,
            COUNT(DISTINCT a.id) AS ads,
            SUM(a.impressions_count) AS viewsAll, SUM(a.clicks_count) AS clicksAll,
            SUM(a.post_impressions_used) AS postsUsed, SUM(a.post_impressions_purchased) AS postsBought, SUM(a.post_impressions_purchased IS NULL) AS unlimited,
            (SELECT COALESCE(SUM(d.impressions), 0) FROM stat_ad_days d JOIN ad_campaigns a2 ON a2.id = d.ad_id WHERE a2.organizer_id = o.id AND d.day >= ?1) AS views,
            (SELECT COALESCE(SUM(d.clicks), 0) FROM stat_ad_days d JOIN ad_campaigns a2 ON a2.id = d.ad_id WHERE a2.organizer_id = o.id AND d.day >= ?1) AS clicks,
            (SELECT COUNT(*) FROM posts p JOIN ad_campaigns a3 ON a3.id = p.ad_id WHERE a3.organizer_id = o.id AND p.status != 'draft' AND p.created_at >= ?2) AS posts
           FROM organizers o LEFT JOIN ad_campaigns a ON a.organizer_id = o.id GROUP BY o.id ORDER BY views DESC, posts DESC, o.name`,
        ).bind(sinceDay, r.sinceSec),
      ]
    : [];
  const res = await db.batch([...posts, ...ads]);
  const [days, statuses, states, people, waits, adDays, organizers] = res;
  const w = rows<{ wait: number }>(waits).map((x) => x.wait).filter((x) => x >= 0);
  const median = w.length ? w[Math.floor(w.length / 2)] : null;
  return {
    days: rows<{ day: string; n: number }>(days),
    statuses: Object.fromEntries(rows<{ status: string; n: number }>(statuses).map((s) => [s.status, s.n])) as Record<string, number>,
    states: rows<{ state: string; n: number; approved: number }>(states),
    people: rows<{ name: string; username: string; avatar: string | null; n: number; approved: number; denied: number }>(people),
    medianWaitSec: median,
    decided: w.length,
    ads: withAds
      ? {
          days: rows<{ day: string; views: number; clicks: number }>(adDays!),
          organizers: rows<{
            id: string;
            name: string;
            logo: string | null;
            ads: number;
            viewsAll: number | null;
            clicksAll: number | null;
            postsUsed: number | null;
            postsBought: number | null;
            unlimited: number | null;
            views: number;
            clicks: number;
            posts: number;
          }>(organizers!),
        }
      : null,
  };
}

/** One advertiser's report: totals, each ad, views per day and the posts that carried their ads. */
export async function advertiserReport(db: D1Database, organizerId: string, r: Range) {
  const sinceDay = new Date(r.sinceSec * 1000).toISOString().slice(0, 10);
  const res = await db.batch([
    db.prepare(`SELECT id, name, logo_url AS logo FROM organizers WHERE id = ?`).bind(organizerId),
    db.prepare(
      `SELECT a.id, a.name, a.image_url AS image, a.status, a.start_date AS startDate, a.end_date AS endDate, a.impressions_count AS viewsAll, a.clicks_count AS clicksAll,
        a.post_impressions_used AS postsUsed, a.post_impressions_purchased AS postsBought,
        COALESCE((SELECT SUM(impressions) FROM stat_ad_days d WHERE d.ad_id = a.id AND d.day >= ?2), 0) AS views,
        COALESCE((SELECT SUM(clicks) FROM stat_ad_days d WHERE d.ad_id = a.id AND d.day >= ?2), 0) AS clicks
       FROM ad_campaigns a WHERE a.organizer_id = ?1 ORDER BY a.created_at DESC`,
    ).bind(organizerId, sinceDay),
    db.prepare(
      `SELECT d.day, SUM(d.impressions) AS views, SUM(d.clicks) AS clicks FROM stat_ad_days d JOIN ad_campaigns a ON a.id = d.ad_id
       WHERE a.organizer_id = ? AND d.day >= ? GROUP BY d.day ORDER BY d.day`,
    ).bind(organizerId, sinceDay),
    db.prepare(
      `SELECT p.id, p.headline, p.ro_state AS state, p.status, p.image_url AS image, p.created_at AS createdAt, p.decided_at AS decidedAt,
        p.feed_channel_id AS channel, p.feed_message_id AS message
       FROM posts p JOIN ad_campaigns a ON a.id = p.ad_id WHERE a.organizer_id = ? AND p.status != 'draft' AND p.created_at >= ? ORDER BY p.created_at DESC LIMIT 100`,
    ).bind(organizerId, r.sinceSec),
  ]);
  const [org, ads, days, posts] = res;
  const o = rows<{ id: string; name: string; logo: string | null }>(org)[0];
  if (!o) return null;
  return {
    organizer: o,
    ads: rows<{
      id: string;
      name: string;
      image: string;
      status: string;
      startDate: number;
      endDate: number;
      viewsAll: number;
      clicksAll: number;
      postsUsed: number;
      postsBought: number | null;
      views: number;
      clicks: number;
    }>(ads),
    days: rows<{ day: string; views: number; clicks: number }>(days),
    posts: rows<{ id: string; headline: string; state: string; status: string; image: string; createdAt: number; decidedAt: number | null; channel: string | null; message: string | null }>(posts),
  };
}
