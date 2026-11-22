// FTN's MCP server: lets an AI app (Claude, ChatGPT, Gemini) operate the admin panel as the person
// who connected it. Streamable HTTP at /mcp, JSON responses, no sessions.
//
// It speaks both protocol eras (checked 2026-11-22):
//  - modern (2026-07-28): stateless, version and client info in each request's _meta, server/discover,
//    Mcp-Method / Mcp-Name headers, resultType on every result.
//  - legacy (2025-03-26 to 2025-11-25): an initialize handshake first. We never issue a session id
//    (optional in those versions), so each request still stands alone.
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, DbClient } from "@/db";
import { oauthGrants } from "@/db/schema";
import { redactSecrets, writeAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";
import { callRoute, shortSession } from "./call";
import { readableSummary } from "./names";
import { aiActorLabel, canUseAi, corsHeaders, loadUser, mcpResource, protectedResourceMetadataUrl, sha256Hex, siteOrigin } from "./oauth";
import { TOOLS, TOOL_MAP, toolListing } from "./tools";
import { ToolCtx, ToolError } from "./types";

export const MODERN_VERSIONS = ["2026-07-28"];
export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SERVER_INFO = { name: "ftn-admin", title: "FTN admin", version: "1.0.0" };
const META = "io.modelcontextprotocol/";
const MAX_TEXT = 150_000;

const INSTRUCTIONS =
  "FTN (ftn.euno.cc) is a news site with a radio station and FTN+ video. These tools operate its admin panel as the person who connected you, " +
  "with their permissions. Public content (articles, posts, Discord messages) is credited to them; the audit log shows you as their AI. " +
  "Read before you write (list_/get_ tools give ids). Tools marked destructive (deleting, publishing to Discord, roles, settings) can't be undone: " +
  "make sure the person wants it before calling one. Times are ISO 8601 with a time zone. " +
  "Images: upload_image (an attached file, base64 or a URL), or ask_for_image when the image is only on the person's device.";

type Json = Record<string, any>;  

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...corsHeaders, ...extra } });
}
const rpcError = (id: unknown, code: number, message: string, data?: unknown, status = 200) =>
  json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } }, status);

function unauthorized(origin: string, error?: string) {
  const parts = [`resource_metadata="${protectedResourceMetadataUrl(origin)}"`, `scope="admin"`];
  if (error) parts.unshift(`error="${error}"`);
  return json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Sign in to FTN first (OAuth)." } },
    401,
    { "www-authenticate": `Bearer ${parts.join(", ")}` }
  );
}

/** Origin check (DNS-rebinding protection): browsers' https pages and local tools only. */
function originAllowed(origin: string | null, self: string): boolean {
  if (!origin) return true;
  if (origin === self) return true;
  try {
    const u = new URL(origin);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

/** Decodes the "=?base64?...?=" header form (2026-07-28 Value Encoding). */
function headerValue(v: string | null): string | null {
  if (v === null) return null;
  const m = /^=\?base64\?(.*)\?=$/.exec(v);
  if (!m) return v;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

async function authenticate(db: DbClient, request: Request, origin: string) {
  const header = request.headers.get("authorization") || "";
  if (!/^bearer /i.test(header)) return { error: unauthorized(origin) };
  const hash = await sha256Hex(header.slice(7).trim());
  const now = new Date();
  const rows = await db
    .select()
    .from(oauthGrants)
    .where(and(eq(oauthGrants.accessHash, hash), isNull(oauthGrants.revokedAt), gt(oauthGrants.accessExpiresAt, now)))
    .limit(1);
  const grant = rows[0];
  if (!grant || grant.resource !== mcpResource(origin)) return { error: unauthorized(origin, "invalid_token") };
  const user = await loadUser(db, grant.userId);
  if (!user) return { error: unauthorized(origin, "invalid_token") };
  if (!canUseAi(user.roles)) {
    return { error: json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Only Site Administrators can use an AI with FTN." } }, 403) };
  }
  if (!grant.lastUsedAt || now.getTime() - grant.lastUsedAt.getTime() > 5 * 60_000) {
    await db.update(oauthGrants).set({ lastUsedAt: now }).where(eq(oauthGrants.id, grant.id));
  }
  return { grant, user };
}

function textResult(value: unknown, isError = false, showSecrets = false) {
  let text = typeof value === "string" ? value : JSON.stringify(showSecrets ? value : redactSecrets(value), null, 1);
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + "\n… (cut: ask for less, e.g. with a search or limit)";
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

export async function handleMcpPost(request: NextRequest): Promise<Response> {
  const origin = siteOrigin(request);
  if (!originAllowed(request.headers.get("origin"), origin)) return rpcError(null, -32600, "Origin not allowed", undefined, 403);

  const d1 = (process.env as any).DB as D1Database;  
  if (!d1) return rpcError(null, -32603, "Database unavailable", undefined, 500);
  const db = getDb(d1);

  let msg: Json;
  try {
    msg = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error", undefined, 400);
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError((msg as Json)?.id, -32600, "Invalid request (one JSON-RPC message per POST)", undefined, 400);
  }

  // Sign-in comes first: a 401 is what starts the OAuth flow in every AI app.
  const auth = await authenticate(db, request, origin);
  if ("error" in auth) return auth.error!;
  const { grant, user } = auth;

  const isNotification = msg.id === undefined || msg.id === null;
  const params: Json = msg.params && typeof msg.params === "object" ? msg.params : {};
  const meta: Json = params._meta && typeof params._meta === "object" ? params._meta : {};
  const modernVersion: string | undefined = typeof meta[`${META}protocolVersion`] === "string" ? meta[`${META}protocolVersion`] : undefined;
  const modern = modernVersion !== undefined;

  if (modern) {
    if (!MODERN_VERSIONS.includes(modernVersion!)) {
      return rpcError(msg.id, -32022, "Unsupported protocol version", { supported: [...MODERN_VERSIONS, ...LEGACY_VERSIONS], requested: modernVersion }, 400);
    }
    // Headers must agree with the body. (A missing header is tolerated, for clients still catching up.)
    const hv = headerValue(request.headers.get("mcp-protocol-version"));
    const hm = headerValue(request.headers.get("mcp-method"));
    const hn = headerValue(request.headers.get("mcp-name"));
    const name = params.name ?? params.uri;
    const mismatch =
      (hv !== null && hv !== modernVersion && `MCP-Protocol-Version header '${hv}' does not match body '${modernVersion}'`) ||
      (hm !== null && hm !== msg.method && `Mcp-Method header '${hm}' does not match body '${msg.method}'`) ||
      (hn !== null && name !== undefined && hn !== String(name) && `Mcp-Name header '${hn}' does not match body '${name}'`);
    if (mismatch) return rpcError(msg.id, -32020, `Header mismatch: ${mismatch}`, undefined, 400);
  }

  if (isNotification) return new Response(null, { status: 202, headers: corsHeaders });

  const ok = (result: Json) =>
    json({
      jsonrpc: "2.0",
      id: msg.id,
      result: modern ? { resultType: "complete", ...result, _meta: { ...(result._meta || {}), [`${META}serverInfo`]: SERVER_INFO } } : result,
    });
  const cacheable = (result: Json) => (modern ? { ...result, ttlMs: 300_000, cacheScope: "private" } : result);

  switch (msg.method) {
    case "initialize": {
      const asked = String(params.protocolVersion || "");
      const protocolVersion = LEGACY_VERSIONS.includes(asked) ? asked : LEGACY_VERSIONS[0];
      return json({
        jsonrpc: "2.0",
        id: msg.id,
        result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS },
      });
    }
    case "server/discover":
      return ok(cacheable({ supportedVersions: [...MODERN_VERSIONS, ...LEGACY_VERSIONS], capabilities: { tools: {} }, instructions: INSTRUCTIONS }));
    case "ping":
      return ok({});
    case "tools/list":
      return ok(cacheable({ tools: toolListing() }));
    case "resources/list":
      return ok(cacheable({ resources: [] }));
    case "resources/templates/list":
      return ok(cacheable({ resourceTemplates: [] }));
    case "prompts/list":
      return ok(cacheable({ prompts: [] }));
    case "tools/call":
      return ok(await callTool(db, request, origin, grant, user, params));
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`, undefined, modern ? 404 : 200);
  }
}

async function callTool(
  db: DbClient,
  request: NextRequest,
  origin: string,
  grant: typeof oauthGrants.$inferSelect,
  user: NonNullable<Awaited<ReturnType<typeof loadUser>>>,
  params: Json
) {
  const tool = TOOL_MAP.get(String(params.name || ""));
  if (!tool) return textResult(`Unknown tool: ${params.name}. Available: ${TOOLS.map((t) => t.name).join(", ")}`, true);
  const args: Json = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
  const missing = (tool.required || []).filter((k) => args[k] === undefined);
  if (missing.length) return textResult(`Missing: ${missing.join(", ")}`, true);

  const ip = getClientIp(request);
  const session = await shortSession(user, grant.clientName);
  const ctx: ToolCtx = {
    db,
    user,
    aiName: grant.clientName,
    grantId: grant.id,
    origin,
    ip,
    call: (handler, opts) => callRoute(handler, opts, { origin, ip, session }) as Promise<any>,  
  };

  const label = aiActorLabel(user, grant.clientName);
  // named before running: after a change the old name may be gone
  const summary = tool.kind === "read" ? "" : await readableSummary(db, tool.summary?.(args) ?? tool.title, tool.refs, args);
  try {
    const result = await tool.run(ctx, args);
    if (tool.kind !== "read") {
      await writeAudit(db, { userId: user.id, actorLabel: label, via: "ai", action: tool.name, summary, status: "ok", detail: { args } });
    }
    return textResult(result ?? { ok: true }, false, tool.showsSecret);
  } catch (err) {
    const message = err instanceof ToolError ? err.message : err instanceof Error ? `Something went wrong: ${err.message}` : "Something went wrong";
    if (tool.kind !== "read") {
      await writeAudit(db, { userId: user.id, actorLabel: label, via: "ai", action: tool.name, summary, status: "error", detail: { args, error: message } });
    }
    return textResult(message, true);
  }
}
