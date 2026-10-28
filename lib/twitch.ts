import { like, eq, inArray } from "drizzle-orm";
import type { DbClient } from "@/db";
import { siteSettings, videos } from "@/db/schema";
import { TWITCH_ID_PREFIX, isTwitchId, twitchLoginFromId, normalizeTwitchLogin } from "@/lib/twitch-id";

// Twitch lives are stored as rows in `videos` (id and youtubeId `twitch_<login>`) only while
// the channel is live, so the rest of FTN+ treats them like any other live stream.
export { TWITCH_ID_PREFIX, isTwitchId, twitchLoginFromId, normalizeTwitchLogin };

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
      const id = `${TWITCH_ID_PREFIX}${login}`;
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

    const stale = await db
      .select({ id: videos.id })
      .from(videos)
      .where(like(videos.id, `${TWITCH_ID_PREFIX}%`));
    const toRemove = stale.map((r) => r.id).filter((id) => !liveIds.includes(id));
    if (toRemove.length > 0) await db.delete(videos).where(inArray(videos.id, toRemove));
    return liveIds.length;
  } catch (err) {
    lastSyncKey = "";
    console.warn("Twitch sync error:", err);
    return 0;
  }
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
