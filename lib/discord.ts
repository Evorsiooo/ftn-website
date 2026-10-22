// Discord REST helpers and constants for the Posts bot. The bot runs as an HTTP
// interactions endpoint (no gateway connection); DISCORD_BOT_TOKEN is a Cloudflare secret.

export const DISCORD_API = "https://discord.com/api/v10";
export const DISCORD_PUBLIC_KEY = "357f89ebbb3fd89e9001113ab534189fe0444c1e00e68cf34418187bbff2751c";

export const FTN_PLUS_CHANNEL_ID = "1545145896893816903";
export const LEADERSHIP_CHANNEL_ID = "1543699067694096426";
export const LEADERSHIP_ROLE_ID = "1152713454982017134";
export const FTN_PLUS_EMOJI = "<:ftnplus_small:1545146466530500618>";

// Feed channel per Ro-State.
export const FEED_CHANNELS: Record<string, string> = {
  harrison: "1404560206381453353",
  ridgeway: "1487545465061769409",
  madison: "1533172498743558205",
  clark: "1487545492685586575",
  firestone: "1487545515431432343",
  international: "1487549180770783273",
};

export function siteUrl(): string {
  return ((process.env as any).SITE_URL as string | undefined) || "https://ftn.euno.cc";
}

export class DiscordError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type DiscordFile = { name: string; data: ArrayBuffer; type: string };

// Calls the Discord REST API. With files, the request is multipart: the JSON body goes in
// payload_json and each file becomes an attachment (referenced by index in `attachments`).
export async function discordApi<T = any>(
  method: string,
  path: string,
  body?: unknown,
  files?: DiscordFile[],
  retried = false
): Promise<T> {
  const token = (process.env as any).DISCORD_BOT_TOKEN as string | undefined;
  if (!token) throw new DiscordError(500, "DISCORD_BOT_TOKEN is not set");

  const headers: Record<string, string> = {
    Authorization: `Bot ${token}`,
    "User-Agent": "FTN-Posts (https://ftn.euno.cc, 1)",
  };
  let payload: BodyInit | undefined;
  if (files && files.length > 0) {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(body ?? {}));
    files.forEach((f, i) => form.append(`files[${i}]`, new Blob([f.data], { type: f.type }), f.name));
    payload = form; // fetch sets the multipart boundary header itself
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${DISCORD_API}${path}`, { method, headers, body: payload });

  if (res.status === 429 && !retried) {
    const data = (await res.json().catch(() => ({}))) as any;
    const wait = Math.min(Number(data.retry_after) || 1, 3);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return discordApi<T>(method, path, body, files, true);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DiscordError(res.status, `Discord ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  // Some endpoints (delete, crosspost) answer with no body.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

// Verifies the Ed25519 signature Discord puts on every interaction request.
export async function verifyDiscordSignature(
  signatureHex: string | null,
  timestamp: string | null,
  rawBody: string,
  publicKeyHex: string = DISCORD_PUBLIC_KEY
): Promise<boolean> {
  if (!signatureHex || !timestamp || !/^[0-9a-f]+$/i.test(signatureHex) || signatureHex.length !== 128) return false;
  const data = new TextEncoder().encode(timestamp + rawBody);
  const signature = hexToBytes(signatureHex);
  const keyBytes = hexToBytes(publicKeyHex);
  const subtle = crypto.subtle as any;
  let key: CryptoKey;
  let algorithm: any;
  try {
    algorithm = { name: "Ed25519" };
    key = await subtle.importKey("raw", keyBytes, algorithm, false, ["verify"]);
  } catch {
    // Older Workers runtimes name the algorithm differently.
    algorithm = { name: "NODE-ED25519", namedCurve: "NODE-ED25519" };
    key = await subtle.importKey("raw", keyBytes, algorithm, false, ["verify"]);
  }
  try {
    return await subtle.verify(algorithm, key, signature, data);
  } catch {
    return false;
  }
}
