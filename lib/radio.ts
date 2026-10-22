import { eq } from "drizzle-orm";
import { decodeEntities } from "@/lib/html-entities";
import { DbClient } from "@/db";
import { siteSettings } from "@/db/schema";

// ---------------------------------------------------------------------------
// Settings
//
// Public radio settings are safe to serve to every visitor. Secure radio settings
// (Icecast credentials, API keys, rotation endpoint, the current broadcast
// password) are stored encrypted and only ever returned to staff.
// ---------------------------------------------------------------------------

export interface RadioPublicSettings {
  discordBotLink: string;
  discordBotCommand: string;
  defaultArtUrl: string;
  stationName: string;
}

export type ArtProvider = "lastfm" | "itunes" | "fanart";

export interface RadioSecureSettings {
  icecastAdminUrl: string;
  icecastUsername: string;
  icecastPassword: string;
  icecastMount: string;
  lastFmApiKey: string;
  fanartTvApiKey: string;
  artPriority: ArtProvider[];
  discordWebhookUrl: string;
  rotationEndpointUrl: string;
  rotationEndpointToken: string;
  rotationFrequencyHours: number; // 0 = automatic rotation off
  rotationTimeUtc: string; // "HH:MM"
  currentPassword: string;
  lastRotatedAt: number | null; // epoch ms
}

export const DEFAULT_PUBLIC_SETTINGS: RadioPublicSettings = {
  discordBotLink: "",
  discordBotCommand: "/setup",
  defaultArtUrl: "",
  stationName: "FTN Radio",
};

export const DEFAULT_SECURE_SETTINGS: RadioSecureSettings = {
  icecastAdminUrl: "",
  icecastUsername: "admin",
  icecastPassword: "",
  icecastMount: "",
  lastFmApiKey: "",
  fanartTvApiKey: "",
  artPriority: ["lastfm", "itunes", "fanart"],
  discordWebhookUrl: "",
  rotationEndpointUrl: "",
  rotationEndpointToken: "",
  rotationFrequencyHours: 0,
  rotationTimeUtc: "00:00",
  currentPassword: "",
  lastRotatedAt: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const PUBLIC_KEY = "radio_public";
const SECURE_KEY = "radio_secure";
const ENC_PREFIX = "enc:v1:";

async function getAesKey(): Promise<CryptoKey> {
  const secret =
    process.env.RADIO_SETTINGS_SECRET ||
    process.env.JWT_SECRET ||
    "ftn-media-group-internal-jwt-signing-secret";
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`ftn-radio-settings:${secret}`)
  );
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function encryptJson(value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await getAesKey(),
    new TextEncoder().encode(JSON.stringify(value))
  );
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), iv.length);
  return ENC_PREFIX + toBase64(out);
}

async function decryptJson<T>(stored: string): Promise<T | null> {
  try {
    if (!stored.startsWith(ENC_PREFIX)) return JSON.parse(stored) as T;
    const raw = fromBase64(stored.slice(ENC_PREFIX.length));
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.slice(0, 12) },
      await getAesKey(),
      raw.slice(12)
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

async function readSetting(db: DbClient, key: string): Promise<string | null> {
  const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  return rows.length > 0 ? rows[0].valueJson : null;
}

async function writeSetting(db: DbClient, key: string, valueJson: string) {
  const existing = await readSetting(db, key);
  if (existing !== null) {
    await db
      .update(siteSettings)
      .set({ valueJson, updatedAt: new Date() })
      .where(eq(siteSettings.key, key));
  } else {
    await db.insert(siteSettings).values({ key, valueJson, updatedAt: new Date() });
  }
}

export async function getPublicRadioSettings(db: DbClient): Promise<RadioPublicSettings> {
  try {
    const stored = await readSetting(db, PUBLIC_KEY);
    if (stored) return { ...DEFAULT_PUBLIC_SETTINGS, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_PUBLIC_SETTINGS };
}

export async function savePublicRadioSettings(db: DbClient, settings: RadioPublicSettings) {
  await writeSetting(db, PUBLIC_KEY, JSON.stringify(settings));
}

export async function getSecureRadioSettings(db: DbClient): Promise<RadioSecureSettings> {
  try {
    const stored = await readSetting(db, SECURE_KEY);
    if (stored) {
      const parsed = await decryptJson<Partial<RadioSecureSettings>>(stored);
      if (parsed) return { ...DEFAULT_SECURE_SETTINGS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_SECURE_SETTINGS };
}

export async function saveSecureRadioSettings(db: DbClient, settings: RadioSecureSettings) {
  await writeSetting(db, SECURE_KEY, await encryptJson(settings));
}

// Main site config (stream URL, public status JSON, on/off) lives in "main_config".
export async function getStreamConfig(
  db: DbClient
): Promise<{ streamUrl: string; statusJson: string; webradioEnabled: boolean }> {
  const fallback = {
    streamUrl: "https://icecast.ftnmedia.org/live.mp3",
    statusJson: "https://icecast.ftnmedia.org/status-json.xsl",
    webradioEnabled: true,
  };
  try {
    const stored = await readSetting(db, "main_config");
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        streamUrl: parsed.streamUrl || fallback.streamUrl,
        statusJson: parsed.statusJson || fallback.statusJson,
        webradioEnabled: parsed.webradioEnabled !== false,
      };
    }
  } catch {}
  return fallback;
}

// ---------------------------------------------------------------------------
// Icecast now playing + album art
// ---------------------------------------------------------------------------

export interface TrackInfo {
  artist: string;
  title: string;
  listeners: number | null;
  online: boolean;
}

function pickSource(sources: any, mount: string, streamUrl: string): any | null {
  const list = (Array.isArray(sources) ? sources : sources ? [sources] : []).filter(Boolean);
  let wanted = mount;
  if (!wanted) {
    try {
      wanted = new URL(streamUrl).pathname;
    } catch {}
  }
  return (
    (wanted && list.find((s: any) => typeof s.listenurl === "string" && s.listenurl.endsWith(wanted))) ||
    list.find((s: any) => s.title || s.server_name) ||
    null
  );
}

async function readIcecastStats(
  url: string,
  headers: Record<string, string>,
  mount: string,
  streamUrl: string
): Promise<TrackInfo | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const source = pickSource(data?.icestats?.source, mount, streamUrl);
    if (!source) return null;

    let artist = typeof source.artist === "string" ? decodeEntities(source.artist) : "";
    let title = typeof source.title === "string" ? decodeEntities(source.title) : "";
    if (!artist && title.includes(" - ")) {
      const [a, ...rest] = title.split(" - ");
      artist = a.trim();
      title = rest.join(" - ").trim();
    }
    return {
      artist,
      title,
      listeners: typeof source.listeners === "number" ? source.listeners : null,
      online: true,
    };
  } catch {
    return null;
  }
}

// Tries the Icecast admin stats first (when credentials are set), then the public
// status JSON, so an unreachable or misconfigured admin URL doesn't read as "offline".
export async function fetchTrackInfo(
  secure: RadioSecureSettings,
  stream: { streamUrl: string; statusJson: string }
): Promise<TrackInfo> {
  if (secure.icecastAdminUrl && secure.icecastPassword) {
    const adminInfo = await readIcecastStats(
      `${secure.icecastAdminUrl.replace(/\/$/, "")}/admin/stats.json`,
      { Authorization: `Basic ${btoa(`${secure.icecastUsername}:${secure.icecastPassword}`)}` },
      secure.icecastMount,
      stream.streamUrl
    );
    if (adminInfo) return adminInfo;
  }
  const publicInfo = stream.statusJson
    ? await readIcecastStats(stream.statusJson, {}, secure.icecastMount, stream.streamUrl)
    : null;
  if (publicInfo) return publicInfo;
  // Stats unreachable (e.g. blocked port or proxy from the edge): the stream itself still
  // answering is a better "online" signal than the metadata endpoints.
  const live = await probeStream(stream.streamUrl);
  return { artist: "", title: "", listeners: null, online: live.ok };
}

// Opens the listener stream just long enough to read headers, then drops it.
export async function probeStream(streamUrl: string): Promise<{ ok: boolean; status?: number; contentType?: string; error?: string }> {
  if (!streamUrl) return { ok: false, error: "No stream URL" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(streamUrl, { signal: controller.signal, cache: "no-store", headers: { "Icy-MetaData": "0" } });
    const contentType = res.headers.get("content-type") || "";
    controller.abort();
    return { ok: res.ok && /audio|ogg|mpeg|aac|octet-stream/i.test(contentType), status: res.status, contentType };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

// Reports what each source of radio state returns, for the admin diagnose endpoint.
export async function diagnoseRadio(
  secure: RadioSecureSettings,
  stream: { streamUrl: string; statusJson: string }
) {
  const check = async (url: string, headers: Record<string, string> = {}) => {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000), cache: "no-store" });
      const text = await res.text();
      let sources: unknown = undefined;
      try {
        const src = JSON.parse(text)?.icestats?.source;
        sources = (Array.isArray(src) ? src : src ? [src] : []).map((x: any) => ({
          listenurl: x?.listenurl,
          title: typeof x?.title === "string" ? decodeEntities(x.title) : x?.title,
          listeners: x?.listeners,
        }));
      } catch {}
      return { url, status: res.status, sources, bodyStart: sources ? undefined : text.slice(0, 160) };
    } catch (err: any) {
      return { url, error: String(err?.message || err) };
    }
  };
  return {
    streamUrl: stream.streamUrl,
    configuredMount: secure.icecastMount || null,
    stream: await probeStream(stream.streamUrl),
    publicStatus: stream.statusJson ? await check(stream.statusJson) : null,
    adminStats:
      secure.icecastAdminUrl && secure.icecastPassword
        ? await check(`${secure.icecastAdminUrl.replace(/\/$/, "")}/admin/stats.json`, {
            Authorization: `Basic ${btoa(`${secure.icecastUsername}:${secure.icecastPassword}`)}`,
          })
        : null,
  };
}

// Per-isolate cache; only an optimisation, results are always re-derivable.
const artCache = new Map<string, string | null>();

export async function lookupAlbumArt(
  artist: string,
  title: string,
  secure: RadioSecureSettings
): Promise<string | null> {
  if (!artist || !title) return null;
  const key = `${artist}-${title}`.toLowerCase().trim();
  if (artCache.has(key)) return artCache.get(key) ?? null;

  let found: string | null = null;
  for (const provider of secure.artPriority) {
    try {
      if (provider === "lastfm" && secure.lastFmApiKey) {
        const url =
          `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${encodeURIComponent(secure.lastFmApiKey)}` +
          `&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&format=json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        const data = (await res.json()) as any;
        const images: any[] = data?.track?.album?.image || [];
        const img = images.find((i) => i.size === "extralarge") || images[images.length - 1];
        if (img?.["#text"]) found = img["#text"];
      } else if (provider === "itunes") {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`)}&entity=song&limit=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        const data = (await res.json()) as any;
        const art = data?.results?.[0]?.artworkUrl100;
        if (art) found = String(art).replace("100x100", "600x600");
      }
      // fanart.tv needs a MusicBrainz id lookup first and is not wired up yet.
    } catch {}
    if (found) break;
  }

  if (artCache.size > 500) artCache.clear();
  artCache.set(key, found);
  return found;
}

// ---------------------------------------------------------------------------
// Password rotation
// ---------------------------------------------------------------------------

export async function rotateBroadcastPassword(
  db: DbClient
): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  const secure = await getSecureRadioSettings(db);
  if (!secure.rotationEndpointUrl || !secure.rotationEndpointToken) {
    return { ok: false, error: "Rotation endpoint is not configured in Radio settings." };
  }

  let newPassword = "";
  try {
    const res = await fetch(secure.rotationEndpointUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${secure.rotationEndpointToken}` },
      signal: AbortSignal.timeout(20000),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) return { ok: false, error: data?.error || `Rotation endpoint returned ${res.status}` };
    newPassword = typeof data?.newPassword === "string" ? data.newPassword.trim() : "";
  } catch (err: any) {
    return { ok: false, error: `Could not reach rotation endpoint: ${err?.message || "request failed"}` };
  }
  if (!newPassword) return { ok: false, error: "Rotation endpoint returned an empty password." };

  await saveSecureRadioSettings(db, {
    ...secure,
    currentPassword: newPassword,
    lastRotatedAt: Date.now(),
  });

  if (secure.discordWebhookUrl) {
    try {
      await fetch(secure.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `🚨 **Broadcast password rotated**\nThe new source password is: \`${newPassword}\``,
        }),
      });
    } catch {}
  }

  return { ok: true, password: newPassword };
}

// True when the automatic rotation schedule says a rotation is due.
export function isRotationDue(secure: RadioSecureSettings, now: Date = new Date()): boolean {
  if (!secure.rotationFrequencyHours || secure.rotationFrequencyHours <= 0) return false;
  if (!secure.lastRotatedAt) return true;

  const intervalMs = secure.rotationFrequencyHours * 60 * 60 * 1000;
  const [h, m] = secure.rotationTimeUtc.split(":").map((n) => parseInt(n, 10) || 0);

  // Intervals of 12h or less just run on elapsed time; longer ones are anchored to rotationTimeUtc.
  if (secure.rotationFrequencyHours <= 12) return now.getTime() - secure.lastRotatedAt >= intervalMs;

  const todayAnchor = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m);
  const lastAnchor = todayAnchor <= now.getTime() ? todayAnchor : todayAnchor - DAY_MS;
  return secure.lastRotatedAt < lastAnchor && now.getTime() - secure.lastRotatedAt >= intervalMs - DAY_MS / 2;
}
