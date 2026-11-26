import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { radioReportBlocks, radioReports, radioSongs } from "@/db/schema";
import { requireStaff } from "@/lib/admin-auth";
import { canManageRadio } from "@/lib/rbac";
import type { ReportDiagnostics, ReportRow, ReportStatus } from "@/lib/radio/reports";

export const runtime = "edge";

const STATUSES: ReportStatus[] = ["new", "fixed", "dismissed"];
const LIMIT = 300;

type Row = typeof radioReports.$inferSelect;
type SongInfo = NonNullable<ReportRow["song"]>;

/** The library songs these reports are about (radio_songs_r2_key_idx: one row read per song). */
async function songsFor(db: ReturnType<typeof getDb>, keys: string[]): Promise<Map<string, SongInfo>> {
  const out = new Map<string, SongInfo>();
  const unique = [...new Set(keys)];
  for (let i = 0; i < unique.length; i += 90) {
    const rows = await db
      .select({ key: radioSongs.r2Key, id: radioSongs.id, archived: radioSongs.archived, durationSec: radioSongs.durationSec, thumbnail: radioSongs.thumbnailUrl, source: radioSongs.source })
      .from(radioSongs)
      .where(inArray(radioSongs.r2Key, unique.slice(i, i + 90)));
    for (const r of rows) out.set(r.key, { id: r.id, archived: !!r.archived, durationSec: r.durationSec, thumbnail: r.thumbnail, source: r.source });
  }
  return out;
}

function shape(r: Row, withDiagnostics: boolean, songs?: Map<string, SongInfo>): ReportRow {
  let diagnostics: ReportDiagnostics | null | undefined = undefined;
  if (withDiagnostics) {
    try {
      diagnostics = r.diagnostics ? (JSON.parse(r.diagnostics) as ReportDiagnostics) : null;
    } catch {
      diagnostics = null;
    }
  }
  return {
    id: r.id,
    kind: r.kind,
    reason: r.reason,
    songKey: r.songKey,
    songTitle: r.songTitle,
    songArtist: r.songArtist,
    details: r.details,
    source: r.source,
    userId: r.userId,
    username: r.username,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    hasDiagnostics: !!r.diagnostics,
    ...(withDiagnostics ? { diagnostics } : {}),
    ...(songs ? { song: (r.songKey && songs.get(r.songKey)) || null } : {}),
  };
}

/**
 * Radio problem reports. ?id= one report with its diagnostics. Otherwise a list (newest first, at most 300):
 * ?status=new|fixed|dismissed|all (default new), ?kind=song|bug, ?q= search, ?diagnostics=1 to include them.
 * Read only when the Reports page (or an AI tool) asks: nothing polls this.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const db = getDb(d1);
  const p = request.nextUrl.searchParams;

  const id = p.get("id");
  if (id) {
    const [r] = await db.select().from(radioReports).where(eq(radioReports.id, id)).limit(1);
    if (!r) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    const songs = await songsFor(db, r.songKey ? [r.songKey] : []);
    return NextResponse.json({ report: shape(r, true, songs) });
  }

  const status = p.get("status") || "new";
  const kind = p.get("kind");
  const q = (p.get("q") || "").trim().slice(0, 100);
  const conds: SQL[] = [];
  if (STATUSES.includes(status as ReportStatus)) conds.push(eq(radioReports.status, status as ReportStatus));
  if (kind === "song" || kind === "bug") conds.push(eq(radioReports.kind, kind));
  if (q) {
    const pat = `%${q.replace(/[%_]/g, "")}%`;
    conds.push(or(like(radioReports.reason, pat), like(radioReports.details, pat), like(radioReports.songTitle, pat), like(radioReports.songArtist, pat), like(radioReports.username, pat))!);
  }
  const withDiag = p.get("diagnostics") === "1";
  const [rows, counts] = await Promise.all([
    db.select().from(radioReports).where(conds.length ? and(...conds) : undefined).orderBy(desc(radioReports.createdAt)).limit(LIMIT),
    // reports are kept 90 days, so this stays a small count
    db.select({ status: radioReports.status, n: sql<number>`count(*)` }).from(radioReports).groupBy(radioReports.status),
  ]);
  const c = { new: 0, fixed: 0, dismissed: 0, all: 0 };
  for (const r of counts) {
    c[r.status] = Number(r.n);
    c.all += Number(r.n);
  }
  const songs = await songsFor(db, rows.flatMap((r) => (r.songKey ? [r.songKey] : [])));
  return NextResponse.json({ reports: rows.map((r) => shape(r, withDiag, songs)), counts: c }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * { ids: [...], status: "new" | "fixed" | "dismissed" } changes reports' status.
 * { action: "block", id, days? } stops the sender of that report from sending more (their account if they were
 * signed in, otherwise their network) for `days` (default 30, 0 = for good), and dismisses their new reports.
 * { action: "unblock", id } lifts that block.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireStaff(request, canManageRadio, "Forbidden: Broadcast Division role required");
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const db = getDb(d1);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const now = new Date();

  if (body.action === "block" || body.action === "unblock") {
    if (typeof body.id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });
    const [r] = await db
      .select({ userId: radioReports.userId, senderHash: radioReports.senderHash, username: radioReports.username })
      .from(radioReports)
      .where(eq(radioReports.id, body.id))
      .limit(1);
    if (!r) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    const key = r.userId ? `user:${r.userId}` : `net:${r.senderHash}`;
    const who = r.userId ? `@${r.username || r.userId}` : "this anonymous sender";
    if (body.action === "unblock") {
      await db.delete(radioReportBlocks).where(eq(radioReportBlocks.key, key));
      return NextResponse.json({ success: true, message: `${r.userId ? who : "This anonymous sender"} can send reports again.` });
    }
    const days = typeof body.days === "number" && body.days >= 0 && body.days <= 3650 ? Math.floor(body.days) : 30;
    const expiresAt = days === 0 ? null : new Date(now.getTime() + days * 86_400_000);
    await db.insert(radioReportBlocks).values({ key, expiresAt, createdAt: now }).onConflictDoUpdate({ target: radioReportBlocks.key, set: { expiresAt } });
    const senderMatch = r.userId ? eq(radioReports.userId, r.userId) : eq(radioReports.senderHash, r.senderHash);
    await db.update(radioReports).set({ status: "dismissed", updatedAt: now }).where(and(senderMatch, eq(radioReports.status, "new")));
    return NextResponse.json({ success: true, message: `Blocked ${who} ${days === 0 ? "for good" : `for ${days} days`}; their new reports were dismissed.` });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 500) : typeof body.id === "string" ? [body.id] : [];
  const status = body.status as ReportStatus;
  if (!ids.length || !STATUSES.includes(status)) return NextResponse.json({ error: "ids and a status (new, fixed, dismissed) are required" }, { status: 400 });
  await db.update(radioReports).set({ status, updatedAt: now }).where(inArray(radioReports.id, ids));
  return NextResponse.json({ success: true, updated: ids.length });
}
