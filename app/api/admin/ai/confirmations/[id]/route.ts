import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiConfirmations } from "@/db/schema";
import { requireStaff } from "@/lib/admin-auth";
import { writeAudit } from "@/lib/audit";
import { callRoute, shortSession } from "@/lib/mcp/call";
import { runConfirmation } from "@/lib/mcp/confirm";
import { aiActorLabel, canUseAi, siteOrigin } from "@/lib/mcp/oauth";
import { TOOL_MAP } from "@/lib/mcp/tools";
import { getClientIp } from "@/lib/rate-limit";
import type { ToolCtx } from "@/lib/mcp/types";

export const runtime = "edge";

async function load(request: NextRequest, id: string) {
  const auth = await requireStaff(request, canUseAi, "Forbidden: Site Administrator role required");
  if ("error" in auth) return { error: auth.error };
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return { error: NextResponse.json({ error: "Database unavailable" }, { status: 500 }) };
  const db = getDb(d1);
  // Only the person the AI acts for can approve its actions.
  const rows = await db.select().from(aiConfirmations).where(and(eq(aiConfirmations.id, id), eq(aiConfirmations.userId, auth.user.id))).limit(1);
  if (!rows[0]) return { error: NextResponse.json({ error: "Not found, or it was asked for by someone else's AI." }, { status: 404 }) };
  return { db, user: auth.user, row: rows[0] };
}

function view(row: typeof aiConfirmations.$inferSelect) {
  const expired = row.status === "pending" && row.expiresAt.getTime() < Date.now();
  return {
    id: row.id,
    app: row.clientName,
    tool: row.tool,
    title: TOOL_MAP.get(row.tool)?.title || row.tool,
    summary: row.summary,
    args: JSON.parse(row.args),
    status: expired ? "expired" : row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    decidedAt: row.decidedAt,
    result: row.result ? JSON.parse(row.result) : null,
  };
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await load(request, (await ctx.params).id);
  if ("error" in r) return r.error;
  return NextResponse.json({ confirmation: view(r.row) });
}

// { decision: "approve" | "cancel" }
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await load(request, (await ctx.params).id);
  if ("error" in r) return r.error;
  const { db, user, row } = r;
  const body = (await request.json().catch(() => ({}))) as { decision?: string };
  const v = view(row);
  if (v.status !== "pending") return NextResponse.json({ error: v.status === "expired" ? "This request has expired. Ask the AI again." : "This was already decided." }, { status: 409 });
  // Claim it first, so a double click can't run it twice.
  const claimed = await db
    .update(aiConfirmations)
    .set({ status: body.decision === "approve" ? "done" : "cancelled", decidedAt: new Date() })
    .where(and(eq(aiConfirmations.id, row.id), eq(aiConfirmations.status, "pending")))
    .returning({ id: aiConfirmations.id });
  if (claimed.length === 0) return NextResponse.json({ error: "This was already decided." }, { status: 409 });

  if (body.decision !== "approve") {
    await writeAudit(db, {
      userId: user.id,
      actorLabel: aiActorLabel(user, row.clientName),
      via: "ai",
      action: row.tool,
      summary: `${row.summary} (cancelled by ${user.robloxUsername})`,
      status: "cancelled",
    });
    return NextResponse.json({ confirmation: { ...v, status: "cancelled" } });
  }

  const tool = TOOL_MAP.get(row.tool);
  if (!tool) return NextResponse.json({ error: "This action no longer exists." }, { status: 410 });
  const origin = siteOrigin(request);
  const ip = getClientIp(request);
  const session = await shortSession(user, row.clientName);
  const toolCtx: ToolCtx = {
    db,
    user,
    aiName: row.clientName,
    grantId: row.grantId,
    origin,
    ip,
    call: (handler, opts) => callRoute(handler, opts, { origin, ip, session }) as Promise<any>,
  };
  const { ok, result } = await runConfirmation(toolCtx, tool, row);
  // The full result (e.g. a new password) goes to this page only; the AI sees a redacted copy.
  return NextResponse.json({ confirmation: { ...v, status: ok ? "done" : "failed", result } });
}
