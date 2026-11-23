import { NextRequest } from "next/server";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { oauthCodes, oauthGrants } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import {
  ACCESS_TOKEN_SECONDS,
  REFRESH_TOKEN_DAYS,
  aiActorLabel,
  authenticateClient,
  canUseAi,
  corsHeaders,
  keepsRefreshToken,
  loadUser,
  mcpResource,
  pkceS256,
  randomToken,
  safeEqual,
  sha256Hex,
  siteOrigin,
  tokenJson,
} from "@/lib/mcp/oauth";

export const runtime = "edge";

const ROTATION_GRACE_MS = 60_000;
const fail = (error: string, description: string, status = 400) => tokenJson({ error, error_description: description }, status);

async function readForm(request: NextRequest): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    // Not standard, but harmless: some clients send JSON.
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await request.text());
}

export async function POST(request: NextRequest) {
  const origin = siteOrigin(request);
  const form = await readForm(request);
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return fail("server_error", "Database unavailable", 500);
  const db = getDb(d1);

  const auth = await authenticateClient(db, request, form);
  if ("error" in auth) return fail(auth.error, "Unknown AI app or wrong client secret.", auth.status);
  const client = auth.client;
  const grantType = form.get("grant_type");
  const resource = form.get("resource");
  if (resource && resource !== mcpResource(origin) && resource !== origin && resource !== `${origin}/`) {
    return fail("invalid_target", "This server only issues tokens for its MCP server.");
  }
  const now = Date.now();

  if (grantType === "authorization_code") {
    const code = form.get("code") || "";
    const verifier = form.get("code_verifier") || "";
    const codeHash = await sha256Hex(code);
    const rows = await db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, codeHash)).limit(1);
    const row = rows[0];
    // one use only, whatever happens next
    if (row) await db.delete(oauthCodes).where(eq(oauthCodes.codeHash, codeHash));
    if (!row || row.expiresAt.getTime() < now) return fail("invalid_grant", "This sign-in code has expired. Connect again.");
    if (row.clientId !== client.id) return fail("invalid_grant", "This code belongs to another app.");
    if (form.get("redirect_uri") && form.get("redirect_uri") !== row.redirectUri) return fail("invalid_grant", "redirect_uri doesn't match.");
    if (!verifier || !safeEqual(await pkceS256(verifier), row.codeChallenge)) return fail("invalid_grant", "PKCE check failed.");

    const user = await loadUser(db, row.userId);
    if (!user || !canUseAi(user.roles)) return fail("invalid_grant", "Only Site Administrators can connect an AI.");

    const access = randomToken("ftn_at_");
    const refresh = randomToken("ftn_rt_");
    const grantId = crypto.randomUUID();
    await db.insert(oauthGrants).values({
      id: grantId,
      clientId: client.id,
      clientName: client.name,
      userId: user.id,
      scope: row.scope,
      resource: row.resource,
      accessHash: await sha256Hex(access),
      accessExpiresAt: new Date(now + ACCESS_TOKEN_SECONDS * 1000),
      refreshHash: await sha256Hex(refresh),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_DAYS * 86400_000),
      createdAt: new Date(now),
    });
    await writeAudit(db, {
      userId: user.id,
      actorLabel: user.robloxUsername,
      via: "web",
      action: "ai.connect",
      summary: `Connected ${client.name} (acts as ${aiActorLabel(user, client.name)})`,
      status: "ok",
    });
    return tokenJson({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_SECONDS, refresh_token: refresh, scope: row.scope });
  }

  if (grantType === "refresh_token") {
    const refresh = form.get("refresh_token") || "";
    const hash = await sha256Hex(refresh);
    const rows = await db
      .select()
      .from(oauthGrants)
      .where(
        and(
          eq(oauthGrants.clientId, client.id),
          isNull(oauthGrants.revokedAt),
          or(eq(oauthGrants.refreshHash, hash), and(eq(oauthGrants.previousRefreshHash, hash), gt(oauthGrants.rotatedAt, new Date(now - ROTATION_GRACE_MS))))
        )
      )
      .limit(1);
    const grant = rows[0];
    if (!grant || grant.refreshExpiresAt.getTime() < now) return fail("invalid_grant", "This connection has ended. Connect again.");
    const user = await loadUser(db, grant.userId);
    if (!user || !canUseAi(user.roles)) {
      await db.update(oauthGrants).set({ revokedAt: new Date(now) }).where(eq(oauthGrants.id, grant.id));
      return fail("invalid_grant", "Only Site Administrators can use an AI with FTN.");
    }

    const access = randomToken("ftn_at_");
    // Gemini must keep its refresh token; everyone else gets a new one each time (OAuth 2.1).
    const rotate = !keepsRefreshToken(client.redirectUris[0] || "");
    const nextRefresh = rotate ? randomToken("ftn_rt_") : refresh;
    await db
      .update(oauthGrants)
      .set({
        accessHash: await sha256Hex(access),
        accessExpiresAt: new Date(now + ACCESS_TOKEN_SECONDS * 1000),
        refreshExpiresAt: new Date(now + REFRESH_TOKEN_DAYS * 86400_000),
        ...(rotate ? { refreshHash: await sha256Hex(nextRefresh), previousRefreshHash: grant.refreshHash, rotatedAt: new Date(now) } : {}),
      })
      .where(eq(oauthGrants.id, grant.id));
    return tokenJson({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_SECONDS, refresh_token: nextRefresh, scope: grant.scope });
  }

  return fail("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
