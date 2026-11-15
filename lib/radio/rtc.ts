import { sql } from "drizzle-orm";
import type { DbClient } from "@/db";
import { radioRtcUsage } from "@/db/schema";

/**
 * Voice for Studio shows goes through Cloudflare Realtime's SFU (never RealtimeKit). The app id
 * and token are Pages secrets (REALTIME_APP_ID, REALTIME_APP_TOKEN); browsers only ever talk to
 * the SFU through /api/radio/rtc, which holds the token.
 *
 * Hard cap (Adrien, 2026-11-15): the SFU's free allowance is 1,000 GB a month. Every connected
 * browser reports once a minute how many voice tracks it sends and receives; the website adds a
 * deliberately high estimate (VOICE_BYTES_PER_SEC per track, the voice being capped at 48 kbps in
 * the browser) and refuses new voice connections, and tells connected ones to hang up, once the
 * month's estimate reaches CAP_BYTES.
 */
export const CAP_BYTES = 800e9;
export const FREE_BYTES = 1000e9;
/** 64 kbps per track: above the 48 kbps the browsers send, plus packet overhead. */
export const VOICE_BYTES_PER_SEC = 8000;
export const BEAT_SEC = 60;

const API = "https://rtc.live.cloudflare.com/v1/apps";

export function rtcConfig(): { appId: string; token: string } | null {
  const env = process.env as Record<string, string | undefined>;
  const appId = env.REALTIME_APP_ID;
  const token = env.REALTIME_APP_TOKEN;
  return appId && token ? { appId, token } : null;
}

export async function sfu(path: string, init: { method: string; body?: unknown }): Promise<{ ok: boolean; status: number; body: any }> {
  const cfg = rtcConfig();
  if (!cfg) return { ok: false, status: 503, body: { error: "Voice isn't set up (REALTIME_APP_ID / REALTIME_APP_TOKEN)." } };
  const r = await fetch(`${API}/${cfg.appId}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body: any = await r.json().catch(() => ({}));
  return { ok: r.ok && !body?.errorCode, status: r.ok ? 200 : r.status, body };
}

// ---- Session tokens: only the browser that opened an SFU session may change it -------------

async function hmac(text: string): Promise<string> {
  const secret = rtcConfig()?.token ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...sig.slice(0, 18))).replace(/\+/g, "-").replace(/\//g, "_");
}

export const sessionToken = (sessionId: string) => hmac(`radio-rtc:${sessionId}`);

export async function checkSessionToken(sessionId: unknown, token: unknown): Promise<boolean> {
  if (typeof sessionId !== "string" || typeof token !== "string" || sessionId.length > 200) return false;
  const want = await sessionToken(sessionId);
  if (want.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

// ---- Usage meter --------------------------------------------------------------------------------

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

export async function usageBytes(db: DbClient): Promise<number> {
  const rows = await db.select({ bytes: radioRtcUsage.bytes }).from(radioRtcUsage).where(sql`${radioRtcUsage.month} = ${monthKey()}`);
  return rows[0]?.bytes ?? 0;
}

export async function overCap(db: DbClient): Promise<boolean> {
  return (await usageBytes(db)) >= CAP_BYTES;
}

/** Adds one beat's worth for [tracks] voice tracks (sent plus received); returns the month's total. */
export async function addUsage(db: DbClient, tracks: number): Promise<number> {
  const n = Math.max(0, Math.min(8, Math.floor(tracks)));
  const bytes = n * VOICE_BYTES_PER_SEC * BEAT_SEC;
  const month = monthKey();
  const now = new Date();
  const rows = await db
    .insert(radioRtcUsage)
    .values({ month, bytes, updatedAt: now })
    .onConflictDoUpdate({ target: radioRtcUsage.month, set: { bytes: sql`${radioRtcUsage.bytes} + ${bytes}`, updatedAt: now } })
    .returning({ bytes: radioRtcUsage.bytes });
  return rows[0]?.bytes ?? bytes;
}

export function usageSummary(bytes: number) {
  return { bytes, capBytes: CAP_BYTES, freeBytes: FREE_BYTES, blocked: bytes >= CAP_BYTES, month: monthKey() };
}
