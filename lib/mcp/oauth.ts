// The site's own OAuth 2.1 server for AI apps (Claude, ChatGPT, Gemini) that connect to the MCP
// server at /mcp. People sign in with their normal FTN login (Roblox) and click Allow; the AI app
// then gets tokens that act as that person. Requirements of each AI app (checked 2026-11-22):
//  - Claude: dynamic registration (DCR) or client metadata documents (CIMD), PKCE S256, a 401 with
//    WWW-Authenticate resource_metadata, rotated refresh tokens, form-encoded token requests.
//  - ChatGPT: CIMD or DCR, `iss` in the authorization response (gives a stable redirect URI),
//    `resource` = this server's URL.
//  - Gemini: DCR is required (registration_endpoint), refresh tokens must NOT be rotated.
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { DbClient } from "@/db";
import { oauthClients, users, userRoles } from "@/db/schema";
import { isRootAdmin } from "@/lib/root-admin";
import type { RobloxUser } from "@/lib/auth";

export const MCP_SCOPE = "admin";
export const ACCESS_TOKEN_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_DAYS = 30; // extended on every refresh
export const CODE_SECONDS = 5 * 60;

/** For now only Site Administrators may connect an AI (Adrien, 2026-11-22). */
export function canUseAi(roles: string[] = []): boolean {
  return roles.includes("site_admin");
}

export function siteOrigin(request: Request): string {
  return new URL(request.url).origin;
}
export const mcpResource = (origin: string) => `${origin}/mcp`;
export const protectedResourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource/mcp`;

export function authorizationServerMetadata(origin: string) {
  const methods = ["none", "client_secret_post", "client_secret_basic"];
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: methods,
    revocation_endpoint_auth_methods_supported: methods,
    scopes_supported: [MCP_SCOPE],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/admin/settings/ai`,
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpResource(origin),
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "FTN admin",
    resource_documentation: `${origin}/admin/settings/ai`,
  };
}

// ── small crypto helpers ──────────────────────────────────────────────────────────────────────

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(prefix = ""): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return prefix + b64url(bytes);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pkceS256(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return b64url(digest);
}

/** Constant-time string compare for secrets and hashes. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== "production" ? "ftn-local-development-only-jwt-secret" : "");
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

// ── the pending sign-in request, carried through the Allow page as a signed token ────────────

export interface AuthRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
  resource: string;
}

// A typ claim no session token has: a session check (which needs `user`) never accepts it.
export async function signAuthRequest(req: AuthRequest): Promise<string> {
  return new SignJWT({ typ: "ftn_oauth_request", req: req as unknown as Record<string, unknown> })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(jwtSecret());
}

export async function verifyAuthRequest(token: string): Promise<AuthRequest | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (payload.typ !== "ftn_oauth_request" || !payload.req) return null;
    return payload.req as unknown as AuthRequest;
  } catch {
    return null;
  }
}

// ── which AI apps may connect: their sign-in return addresses ─────────────────────────────────

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Return addresses of the AI apps we support. More can be added with MCP_EXTRA_REDIRECTS
 * (comma-separated URL prefixes) in Cloudflare's environment variables. */
export function isAllowedRedirect(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  // Native apps on this computer (Claude Code, MCP Inspector): http on a loopback address, any port.
  if (u.protocol === "http:" && LOOPBACK_HOSTS.has(u.hostname)) return true;
  if (u.protocol !== "https:") return false;
  const host = u.hostname;
  const path = u.pathname;
  if ((host === "claude.ai" || host === "claude.com") && path === "/api/mcp/auth_callback") return true;
  if (host === "chatgpt.com" && (path === "/connector_platform_oauth_redirect" || path.startsWith("/connector/oauth/"))) return true;
  if (/^oauth-redirect(-sandbox|-test)?\.googleusercontent\.com$/.test(host) && /^\/(r|a)\//.test(path)) return true;
  const extra = (process.env.MCP_EXTRA_REDIRECTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return extra.some((prefix) => prefix.startsWith("https://") && uri.startsWith(prefix));
}

/** Google's apps must keep the same refresh token (Gemini doesn't handle rotated ones). */
export function keepsRefreshToken(redirectUri: string): boolean {
  try {
    return new URL(redirectUri).hostname.endsWith(".googleusercontent.com");
  } catch {
    return false;
  }
}

/** Does `requested` match one of the app's registered return addresses? Loopback addresses match
 * on any port (RFC 8252 7.3): native apps pick a free port each time. */
export function redirectMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let r: URL;
  try {
    r = new URL(requested);
  } catch {
    return false;
  }
  if (r.protocol !== "http:" || !LOOPBACK_HOSTS.has(r.hostname)) return false;
  return registered.some((reg) => {
    try {
      const g = new URL(reg);
      return g.protocol === "http:" && LOOPBACK_HOSTS.has(g.hostname) && g.hostname === r.hostname && g.pathname === r.pathname && g.search === r.search;
    } catch {
      return false;
    }
  });
}

/** "Claude", "ChatGPT" or "Gemini" from whatever name the app registered with; otherwise its
 * own name, trimmed. Self-reported by the app: a label, not proof. */
export function friendlyAiName(raw: string | null | undefined, redirectUri?: string): string {
  const name = (raw || "").trim();
  const n = name.toLowerCase();
  let host = "";
  try {
    host = redirectUri ? new URL(redirectUri).hostname : "";
  } catch {}
  if (n.includes("claude") || n.includes("anthropic") || host === "claude.ai" || host === "claude.com") return "Claude";
  if (n.includes("chatgpt") || n.includes("openai") || host === "chatgpt.com") return "ChatGPT";
  if (n.includes("gemini") || host.endsWith(".googleusercontent.com")) return "Gemini";
  return name.replace(/[^\p{L}\p{N} ._'()-]/gu, "").slice(0, 40) || "AI app";
}

// ── clients ───────────────────────────────────────────────────────────────────────────────────

export interface ClientRecord {
  id: string;
  name: string;
  redirectUris: string[];
  secretHash: string | null;
  kind: "dcr" | "cimd";
}

const CIMD_REFRESH_MS = 24 * 60 * 60 * 1000;

/** Find a client: a registered one, or a client metadata document fetched from its https id. */
export async function getClient(db: DbClient, clientId: string): Promise<ClientRecord | null> {
  if (!clientId || clientId.length > 500) return null;
  const rows = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
  const row = rows[0];
  const fresh = row && (row.kind === "dcr" || Date.now() - row.createdAt.getTime() < CIMD_REFRESH_MS);
  if (row && fresh) {
    return { id: row.id, name: row.name, redirectUris: JSON.parse(row.redirectUris), secretHash: row.secretHash, kind: row.kind };
  }
  if (!clientId.startsWith("https://")) return null;
  const doc = await fetchClientMetadata(clientId);
  if (!doc) return row ? { id: row.id, name: row.name, redirectUris: JSON.parse(row.redirectUris), secretHash: null, kind: "cimd" } : null;
  const record: ClientRecord = { id: clientId, name: doc.name, redirectUris: doc.redirectUris, secretHash: null, kind: "cimd" };
  const values = { id: clientId, name: doc.name, redirectUris: JSON.stringify(doc.redirectUris), secretHash: null, kind: "cimd" as const, createdAt: new Date() };
  await db.insert(oauthClients).values(values).onConflictDoUpdate({ target: oauthClients.id, set: values });
  return record;
}

async function fetchClientMetadata(url: string): Promise<{ name: string; redirectUris: string[] } | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.pathname === "/" || u.hash) return null;
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 64 * 1024) return null;
    const doc = JSON.parse(text) as { client_id?: string; client_name?: string; redirect_uris?: unknown; token_endpoint_auth_method?: string };
    if (doc.client_id !== url) return null;
    const uris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((x): x is string => typeof x === "string") : [];
    const allowed = uris.filter(isAllowedRedirect);
    if (allowed.length === 0) return null;
    // public clients only: a metadata document can't hold a secret
    if (doc.token_endpoint_auth_method && doc.token_endpoint_auth_method !== "none") return null;
    return { name: friendlyAiName(doc.client_name, allowed[0]), redirectUris: allowed.slice(0, 20) };
  } catch {
    return null;
  }
}

/** Client authentication at the token and revocation endpoints. */
export async function authenticateClient(
  db: DbClient,
  request: Request,
  form: URLSearchParams
): Promise<{ client: ClientRecord } | { error: string; status: number }> {
  let clientId = form.get("client_id") || "";
  let secret = form.get("client_secret") || "";
  const basic = request.headers.get("authorization");
  if (basic?.toLowerCase().startsWith("basic ")) {
    try {
      const [id, sec] = atob(basic.slice(6).trim()).split(":");
      clientId = decodeURIComponent(id || "");
      secret = decodeURIComponent(sec || "");
    } catch {
      return { error: "invalid_client", status: 401 };
    }
  }
  const client = await getClient(db, clientId);
  if (!client) return { error: "invalid_client", status: 401 };
  if (client.secretHash) {
    if (!secret || !safeEqual(await sha256Hex(secret), client.secretHash)) return { error: "invalid_client", status: 401 };
  }
  return { client };
}

// ── the person behind a token ─────────────────────────────────────────────────────────────────

/** The user with their current roles (roles are read fresh, so removing a role takes effect at once). */
export async function loadUser(db: DbClient, userId: string): Promise<RobloxUser | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const u = rows[0];
  if (!u) return null;
  const roles = (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.role as string);
  if (isRootAdmin(u.robloxId) && !roles.includes("site_admin")) roles.push("site_admin");
  return {
    id: u.id,
    robloxId: u.robloxId || "",
    robloxUsername: u.robloxUsername,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl || undefined,
    roles,
  };
}

/** "adrien's Claude": how an AI acting for someone shows up in internal records. */
export function aiActorLabel(user: { robloxUsername: string }, aiName: string): string {
  return `${user.robloxUsername}'s ${aiName}`;
}

export const tokenJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", pragma: "no-cache", ...corsHeaders },
  });

export const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, content-type, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id, last-event-id, accept",
  "access-control-expose-headers": "www-authenticate, mcp-session-id, mcp-protocol-version",
  "access-control-max-age": "86400",
};

