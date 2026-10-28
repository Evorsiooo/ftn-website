// Pure helpers for Twitch channel ids, safe to import from client components.
export const TWITCH_ID_PREFIX = "twitch_";

export function isTwitchId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(TWITCH_ID_PREFIX);
}

export function twitchLoginFromId(id: string): string {
  return id.slice(TWITCH_ID_PREFIX.length);
}

/** Accepts a login, an @name or a twitch.tv URL; returns a valid lowercase login or null. */
export function normalizeTwitchLogin(input: string): string | null {
  let s = (input || "").trim().toLowerCase();
  s = s.replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//, "").split(/[/?#]/)[0].replace(/^@/, "");
  return /^[a-z0-9_]{3,25}$/.test(s) ? s : null;
}

