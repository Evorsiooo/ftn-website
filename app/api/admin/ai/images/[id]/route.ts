import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiImageRequests } from "@/db/schema";
import { requireStaff } from "@/lib/admin-auth";
import { writeAudit } from "@/lib/audit";
import { aiActorLabel, canUseAi } from "@/lib/mcp/oauth";

export const runtime = "edge";

// An image an AI asked for (ask_for_image). The page uploads the file through /api/upload, then
// hands its URL over here, where the AI picks it up with get_image_request.
async function load(request: NextRequest, id: string) {
  const auth = await requireStaff(request, canUseAi, "Forbidden: Site Administrator role required");
  if ("error" in auth) return { error: auth.error };
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return { error: NextResponse.json({ error: "Database unavailable" }, { status: 500 }) };
  const db = getDb(d1);
  const rows = await db.select().from(aiImageRequests).where(and(eq(aiImageRequests.id, id), eq(aiImageRequests.userId, auth.user.id))).limit(1);
  if (!rows[0]) return { error: NextResponse.json({ error: "Not found, or it was asked for by someone else's AI." }, { status: 404 }) };
  return { db, user: auth.user, row: rows[0] };
}

function view(row: typeof aiImageRequests.$inferSelect) {
  const expired = row.status === "pending" && row.expiresAt.getTime() < Date.now();
  return {
    id: row.id,
    app: row.clientName,
    folder: row.folder,
    note: row.note,
    status: expired ? "expired" : row.status,
    url: row.url,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    decidedAt: row.decidedAt,
  };
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await load(request, (await ctx.params).id);
  if ("error" in r) return r.error;
  return NextResponse.json({ request: view(r.row) });
}

// { url } once the image is uploaded, or { cancel: true }
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await load(request, (await ctx.params).id);
  if ("error" in r) return r.error;
  const { db, user, row } = r;
  const body = (await request.json().catch(() => ({}))) as { url?: unknown; cancel?: boolean };
  const v = view(row);
  if (v.status !== "pending") return NextResponse.json({ error: v.status === "expired" ? "This link has expired. Ask the AI again." : "This was already done." }, { status: 409 });
  const url = body.cancel ? null : body.url;
  if (!body.cancel && (typeof url !== "string" || !url.startsWith(`/api/media/${row.folder}/`) || !/^[\w/.-]+$/.test(url) || url.includes(".."))) {
    return NextResponse.json({ error: "Upload the image first." }, { status: 400 });
  }
  const status = body.cancel ? "cancelled" : "done";
  const claimed = await db
    .update(aiImageRequests)
    .set({ status, url: url as string | null, decidedAt: new Date() })
    .where(and(eq(aiImageRequests.id, row.id), eq(aiImageRequests.status, "pending")))
    .returning({ id: aiImageRequests.id });
  if (claimed.length === 0) return NextResponse.json({ error: "This was already done." }, { status: 409 });
  await writeAudit(db, {
    userId: user.id,
    actorLabel: aiActorLabel(user, row.clientName),
    via: "ai",
    action: "ask_for_image",
    summary: `Image ${row.note ? `"${row.note}" ` : ""}${body.cancel ? `cancelled by ${user.robloxUsername}` : `uploaded by ${user.robloxUsername}`}`,
    status: body.cancel ? "cancelled" : "ok",
    detail: { requestId: row.id, url },
  });
  return NextResponse.json({ request: { ...v, status, url } });
}
