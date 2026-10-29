// Pure helpers for Twitch channel ids, safe to import from client components.
export const TWITCH_ID_PREFIX = "twitch_";

export function isTwitchId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(TWITCH_ID_PREFIX);
}

// A broadcast id is `twitch_<login>-<twitch stream id>`: logins never contain "-", so the last "-" splits them.
// Every stream gets its own id, so a new broadcast from the same channel never reuses an old URL.
// The older `twitch_<login>` form (one URL per channel) still parses, with no stream id.
const TWITCH_ID_RE = /^twitch_([a-z0-9_]{1,25})(?:-(\d+))?$/i;

export function twitchBroadcastId(login: string, streamId: string): string {
  return `${TWITCH_ID_PREFIX}${login.toLowerCase()}-${streamId}`;
}

export function parseTwitchId(id: string | null | undefined): { login: string; streamId: string | null } | null {
  const m = TWITCH_ID_RE.exec(id || "");
  return m ? { login: m[1].toLowerCase(), streamId: m[2] ?? null } : null;
}

export function twitchLoginFromId(id: string): string {
  return parseTwitchId(id)?.login ?? id.slice(TWITCH_ID_PREFIX.length);
}

/** Accepts a login, an @name or a twitch.tv URL; returns a valid lowercase login or null. */
export function normalizeTwitchLogin(input: string): string | null {
  let s = (input || "").trim().toLowerCase();
  s = s.replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//, "").split(/[/?#]/)[0].replace(/^@/, "");
  return /^[a-z0-9_]{3,25}$/.test(s) ? s : null;
}


// Public watch URLs look the same for every video: 11 URL-safe characters, like a YouTube id.
// A Twitch broadcast's public id packs its stream id (5 bytes) and a 3-byte hash of the channel login
// into 8 bytes, base64url. It is reversible without a lookup table: the stream id is read back directly
// and the login is the configured channel whose hash matches.
function loginHash(login: string): number {
  let h = 0x811c9dc5;
  for (const ch of login.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h & 0xffffff;
}

export function publicTwitchId(login: string, streamId: string): string | null {
  const n = Number(streamId);
  if (!/^\d+$/.test(streamId) || !Number.isSafeInteger(n) || n >= 2 ** 40) return null;
  const bytes = new Uint8Array(8);
  for (let i = 4, v = n; i >= 0; i--, v = Math.floor(v / 256)) bytes[i] = v % 256;
  const h = loginHash(login);
  bytes[5] = (h >> 16) & 255;
  bytes[6] = (h >> 8) & 255;
  bytes[7] = h & 255;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Maps an internal video id to the id used in watch URLs (only Twitch broadcasts differ). */
export function publicVideoId(id: string): string {
  const t = parseTwitchId(id);
  return (t?.streamId && publicTwitchId(t.login, t.streamId)) || id;
}

/** Reads a public id back into a Twitch broadcast, given the channels it could belong to. */
export function resolvePublicTwitchId(id: string, logins: string[]): { login: string; streamId: string } | null {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  let bytes: Uint8Array;
  try {
    const bin = atob(id.replace(/-/g, "+").replace(/_/g, "/") + "=");
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.length !== 8) return null;
  let n = 0;
  for (let i = 0; i < 5; i++) n = n * 256 + bytes[i];
  const h = (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
  const login = logins.find((l) => loginHash(l) === h);
  const streamId = String(n);
  const back = login ? publicTwitchId(login, streamId) : null;
  return login && back === id ? { login: login.toLowerCase(), streamId } : null;
}

/**
 * A Twitch broadcast that has ended but whose recording was not found yet. Its row is kept for a few
 * minutes (its `createdAt` is set to the moment it ended) and stays out of every list until the recording shows up.
 */
export function isPendingTwitchRecording(v: { id?: string | null; youtubeId?: string | null; isLive?: boolean | null; durationSeconds?: number | null }): boolean {
  return isTwitchId(v.youtubeId || v.id) && !v.isLive && !(v.durationSeconds && v.durationSeconds > 0);
}
