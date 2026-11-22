import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { aiImageRequests, auditLog, oauthGrants, users } from "@/db/schema";
import { requireStaff } from "@/lib/admin-auth";
import { writeAudit } from "@/lib/audit";
import { canUseAi, mcpResource, siteOrigin } from "@/lib/mcp/oauth";

export const runtime = "edge";

// Settings > AI access: the MCP address, connected AI apps, images an AI is waiting for, audit log.
export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, canUseAi, "Forbidden: Site Administrator role required");
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const db = getDb(d1);
  const via = request.nextUrl.searchParams.get("via");
  const now = new Date();
  const [grants, pending, audit] = await Promise.all([
    db
      .select({ grant: oauthGrants, username: users.robloxUsername, displayName: users.displayName })
      .from(oauthGrants)
      .innerJoin(users, eq(users.id, oauthGrants.userId))
      .where(and(isNull(oauthGrants.revokedAt), gt(oauthGrants.refreshExpiresAt, now)))
      .orderBy(desc(oauthGrants.createdAt)),
    db
      .select()
      .from(aiImageRequests)
      .where(and(eq(aiImageRequests.userId, auth.user.id), eq(aiImageRequests.status, "pending"), gt(aiImageRequests.expiresAt, now)))
      .orderBy(desc(aiImageRequests.createdAt)),
    db
      .select()
      .from(auditLog)
      .where(via === "ai" || via === "web" ? eq(auditLog.via, via) : undefined)
      .orderBy(desc(auditLog.at))
      .limit(200),
  ]);
  return NextResponse.json({
    mcpUrl: mcpResource(siteOrigin(request)),
    connections: grants.map(({ grant, username, displayName }) => ({
      id: grant.id,
      app: grant.clientName,
      username,
      displayName,
      mine: grant.userId === auth.user.id,
      createdAt: grant.createdAt,
      lastUsedAt: grant.lastUsedAt,
    })),
    pending: pending.map((p) => ({ id: p.id, app: p.clientName, summary: p.note || "An image", createdAt: p.createdAt, expiresAt: p.expiresAt })),
    audit: audit.map((a) => ({ id: a.id, at: a.at, who: a.actorLabel, via: a.via, action: a.action, summary: a.summary, status: a.status })),
  });
}

// { action: "disconnect", id }: ends an AI app's connection (its tokens stop working at once).
export async function POST(request: NextRequest) {
  const auth = await requireStaff(request, canUseAi, "Forbidden: Site Administrator role required");
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const db = getDb(d1);
  const body = (await request.json().catch(() => ({}))) as { action?: string; id?: string };
  if (body.action !== "disconnect" || !body.id) return NextResponse.json({ error: "Send { action: \"disconnect\", id }" }, { status: 400 });
  const rows = await db.select().from(oauthGrants).where(eq(oauthGrants.id, body.id)).limit(1);
  if (!rows[0]) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  await db.update(oauthGrants).set({ revokedAt: new Date() }).where(eq(oauthGrants.id, body.id));
  await writeAudit(db, {
    userId: auth.user.id,
    actorLabel: auth.user.robloxUsername,
    via: "web",
    action: "ai.disconnect",
    summary: `Disconnected ${rows[0].clientName}${rows[0].userId === auth.user.id ? "" : " (someone else's)"}`,
    status: "ok",
  });
  return NextResponse.json({ ok: true });
}
