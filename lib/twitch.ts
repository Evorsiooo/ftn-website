import { like, eq } from "drizzle-orm";
import type { DbClient } from "@/db";
import { siteSettings, videos } from "@/db/schema";
import { TWITCH_ID_PREFIX, isTwitchId, twitchLoginFromId, normalizeTwitchLogin, twitchBroadcastId, parseTwitchId, isPendingTwitchRecording } from "@/lib/twitch-id";

// Twitch broadcasts are rows in `videos` (id and youtubeId `twitch_<login>-<stream id>`, one per broadcast),
// so the rest of FTN+ treats them like any other video: live while the channel is live, and afterwards a normal
// video for as long as Twitch keeps the recording (see settleEndedBroadcasts). Public URLs use publicVideoId.
export { TWITCH_ID_PREFIX, isTwitchId, twitchLoginFromId, normalizeTwitchLogin, twitchBroadcastId, parseTwitchId, isPendingTwitchRecording };

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAppToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  if (!data.access_token) return null;
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

async function helix(path: string, clientId: string, clientSecret: string): Promise<any | null> {
  const token = await getAppToken(clientId, clientSecret);
  if (!token) return null;
  const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) cachedToken = null;
  if (!res.ok) return null;
  return res.json();
}

let lastSyncAt = 0;
let lastSyncKey = "";

/**
 * Checks which of the configured Twitch channels are live and mirrors that into `videos`:
 * live channels get a live row, anything else (offline or no longer configured) loses it.
 * Does nothing without TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET, or when Twitch cannot be reached.
 */
export async function syncTwitchLives(
  db: DbClient,
  channels: string[],
  opts: { cooldownMs?: number } = {}
): Promise<number> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return 0;

  const logins = Array.from(new Set(channels.map(normalizeTwitchLogin).filter((l): l is string => !!l))).slice(0, 100);
  const key = logins.join(",");
  const cooldown = opts.cooldownMs ?? 45_000;
  if (key === lastSyncKey && Date.now() - lastSyncAt < cooldown) return 0;
  lastSyncAt = Date.now();
  lastSyncKey = key;

  try {
    let liveStreams: any[] = [];
    let profiles = new Map<string, string>();
    if (logins.length > 0) {
      const query = logins.map((l) => `user_login=${encodeURIComponent(l)}`).join("&");
      const streams = await helix(`streams?first=100&${query}`, clientId, clientSecret);
      if (!streams || !Array.isArray(streams.data)) {
        lastSyncKey = ""; // let the next request retry
        return 0;
      }
      liveStreams = streams.data.filter((s: any) => s.type === "live");
      if (liveStreams.length > 0) {
        const users = await helix(
          `users?${liveStreams.map((s: any) => `login=${encodeURIComponent(s.user_login)}`).join("&")}`,
          clientId,
          clientSecret
        );
        for (const u of users?.data ?? []) profiles.set(u.login, u.profile_image_url);
      }
    }

    const liveIds: string[] = [];
    for (const s of liveStreams) {
      const login = String(s.user_login).toLowerCase();
      const id = twitchBroadcastId(login, String(s.id));
      liveIds.push(id);
      const row = {
        channelId: login,
        channelTitle: s.user_name || login,
        channelHandle: `@${login}`,
        channelLogoUrl: profiles.get(login) ?? null,
        title: s.title || `${s.user_name || login} is live`,
        description: s.game_name ? `Live on Twitch: ${s.game_name}` : "Live on Twitch",
        thumbnailUrl: String(s.thumbnail_url || "")
          .replace("{width}", "1280")
          .replace("{height}", "720"),
        publishedAt: s.started_at ? new Date(s.started_at) : new Date(),
        videoType: "livestream" as const,
        isLive: true,
        durationSeconds: 0,
      };
      const existing = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, id)).limit(1);
      if (existing.length > 0) await db.update(videos).set(row).where(eq(videos.id, id));
      else await db.insert(videos).values({ id, youtubeId: id, ...row });
    }

    await settleEndedBroadcasts(db, logins, liveIds, clientId, clientSecret);
    return liveIds.length;
  } catch (err) {
    lastSyncKey = "";
    console.warn("Twitch sync error:", err);
    return 0;
  }
}

const RECORDING_WAIT_MS = 15 * 60 * 1000;
const READY_RECHECK_MS = 10 * 60 * 1000;
let lastReadyCheck = 0;

function parseTwitchDuration(d: unknown): number {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(String(d ?? ""));
  return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
}

/**
 * Twitch broadcasts that are no longer live keep their row, as a normal video, once their recording exists:
 *  - just ended: the row stops being live and waits (hidden) for the recording, which can take a few minutes;
 *  - recording found: title, thumbnail and length come from it and the broadcast joins the library;
 *  - no recording within RECORDING_WAIT_MS, a channel no longer configured, or a recording Twitch has since
 *    removed (they expire after 7 to 60 days, or the streamer deletes them): the row is deleted.
 * Rows in the library are rechecked every READY_RECHECK_MS, rows waiting for a recording on every sync.
 */
async function settleEndedBroadcasts(db: DbClient, logins: string[], liveIds: string[], clientId: string, clientSecret: string) {
  const rows = await db.select().from(videos).where(like(videos.id, `${TWITCH_ID_PREFIX}%`));
  const ended = rows.filter((r) => !liveIds.includes(r.id));
  if (ended.length === 0) return;

  const now = Date.now();
  const recheckReady = now - lastReadyCheck >= READY_RECHECK_MS;
  if (recheckReady) lastReadyCheck = now;
  const archives = new Map<string, Map<string, any> | null>();
  const archivesOf = async (login: string) => {
    if (!archives.has(login)) archives.set(login, await fetchChannelArchives(login, clientId, clientSecret));
    return archives.get(login)!;
  };

  const toDelete: string[] = [];
  for (const r of ended) {
    const t = parseTwitchId(r.id);
    if (!t || !t.streamId || !logins.includes(t.login)) {
      toDelete.push(r.id);
      continue;
    }
    let row = r;
    if (r.isLive) {
      // Just ended; createdAt now records when.
      await db.update(videos).set({ isLive: false, durationSeconds: 0, videoType: "video", createdAt: new Date() }).where(eq(videos.id, r.id));
      row = { ...r, isLive: false, durationSeconds: 0, createdAt: new Date() };
    }
    const pending = isPendingTwitchRecording(row);
    if (!pending && !recheckReady) continue;
    const list = await archivesOf(t.login);
    if (!list) continue; // Twitch unreachable: decide nothing this time
    const vod = list.get(t.streamId);
    if (vod) {
      await db
        .update(videos)
        .set({
          title: vod.title || row.title,
          thumbnailUrl: vod.thumbnail_url ? String(vod.thumbnail_url).replace("%{width}", "1280").replace("%{height}", "720") : row.thumbnailUrl,
          durationSeconds: Math.max(1, parseTwitchDuration(vod.duration)),
          videoType: "video",
          isLive: false,
        })
        .where(eq(videos.id, r.id));
    } else if (!pending || now - new Date(row.createdAt).getTime() > RECORDING_WAIT_MS) {
      toDelete.push(r.id);
    }
  }
  for (const id of toDelete) await db.delete(videos).where(eq(videos.id, id));
}

/** Reads the channel list saved in the site settings (main_config.twitchChannels) and syncs it. */
export async function syncConfiguredTwitchLives(db: DbClient): Promise<number> {
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, "main_config")).limit(1);
  let channels: string[] = [];
  try {
    const list = rows.length ? JSON.parse(rows[0].valueJson).twitchChannels : [];
    if (Array.isArray(list)) channels = list.filter((c: unknown): c is string => typeof c === "string");
  } catch {}
  return syncTwitchLives(db, channels);
}

export interface TwitchBroadcast {
  /** Twitch video id of the recording, without the leading "v". */
  vodId: string;
  title: string;
  startedAt: string | null;
  thumbnailUrl: string | null;
  channelTitle: string;
  channelLogoUrl: string | null;
}

/** A channel's recordings keyed by the stream id they came from; null when Twitch cannot be reached. */
async function fetchChannelArchives(login: string, clientId: string, clientSecret: string): Promise<Map<string, any> | null> {
  try {
    const users = await helix(`users?login=${encodeURIComponent(login)}`, clientId, clientSecret);
    const user = users?.data?.[0];
    if (!user) return null;
    const vods = await helix(`videos?user_id=${encodeURIComponent(user.id)}&type=archive&first=100`, clientId, clientSecret);
    if (!vods || !Array.isArray(vods.data)) return null;
    return new Map(vods.data.filter((v: any) => v.stream_id).map((v: any) => [String(v.stream_id), v]));
  } catch (err) {
    console.warn("Twitch archives lookup error:", err);
    return null;
  }
}

/**
 * Finds the recording of a finished broadcast, by the stream id in its FTN+ id.
 * Returns null without Twitch credentials, when Twitch cannot be reached, or when no recording exists
 * (Twitch only keeps recordings for a limited time, and streamers can turn them off).
 */
export async function findTwitchBroadcast(login: string, streamId: string): Promise<TwitchBroadcast | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret || !/^[a-z0-9_]{1,25}$/.test(login) || !/^\d+$/.test(streamId)) return null;
  try {
    const users = await helix(`users?login=${encodeURIComponent(login)}`, clientId, clientSecret);
    const user = users?.data?.[0];
    if (!user) return null;
    const vods = await helix(`videos?user_id=${encodeURIComponent(user.id)}&type=archive&first=100`, clientId, clientSecret);
    const vod = (vods?.data ?? []).find((v: any) => String(v.stream_id) === streamId);
    if (!vod) return null;
    return {
      vodId: String(vod.id),
      title: vod.title || `${user.display_name || login} broadcast`,
      startedAt: vod.created_at ?? null,
      thumbnailUrl: vod.thumbnail_url ? String(vod.thumbnail_url).replace("%{width}", "1280").replace("%{height}", "720") : null,
      channelTitle: user.display_name || login,
      channelLogoUrl: user.profile_image_url ?? null,
    };
  } catch (err) {
    console.warn("Twitch broadcast lookup error:", err);
    return null;
  }
}
