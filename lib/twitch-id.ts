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

