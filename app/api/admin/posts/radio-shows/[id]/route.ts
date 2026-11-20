import { NextRequest, NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { radioReplayParts, radioReplays, radioShows, users } from "@/db/schema";
import { requireStaff } from "@/lib/admin-auth";
import { canManagePosts } from "@/lib/rbac";
import type { ClipShow } from "@/lib/radio-clips/model";

export const runtime = "edge";

type Params = { params: Promise<{ id: string }> };

/** One show to clip: its running orders, each person's recorded voice (with who it is) and pauses. */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireStaff(request, canManagePosts, "Forbidden: Staff permissions required");
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const db = getDb(d1);
  const [row] = await db
    .select({ r: radioReplays, showArt: radioShows.artUrl })
    .from(radioReplays)
    .leftJoin(radioShows, eq(radioShows.id, radioReplays.showId))
    .where(eq(radioReplays.id, id));
  if (!row || !row.r.endedAt) return NextResponse.json({ error: "Show not found" }, { status: 404 });
  const parts = await db.select().from(radioReplayParts).where(eq(radioReplayParts.replayId, id)).orderBy(asc(radioReplayParts.startMs));
  const userIds = [...new Set(parts.map((p) => p.userId).filter((u): u is string => !!u))];
  const people = userIds.length
    ? await db.select({ userId: users.id, name: users.displayName, avatar: users.avatarUrl }).from(users).where(inArray(users.id, userIds))
    : [];
  const endedAt = row.r.endedAt.getTime();
  const show: ClipShow = {
    id,
    title: row.r.title,
    art: row.r.artUrl ?? row.showArt ?? null,
    startedAt: row.r.startedAt.getTime(),
    endedAt,
    timelines: parts.filter((p) => p.kind === "timeline" && p.r2Key).map((p) => p.r2Key!),
    voices: parts.filter((p) => p.kind === "voice" && p.r2Key).map((p) => ({ key: p.r2Key!, start: p.startMs, end: p.endMs ?? p.startMs, userId: p.userId })),
    pauses: parts.filter((p) => p.kind === "pause").map((p) => ({ start: p.startMs, end: p.endMs ?? endedAt })),
    // in the order they were first heard
    people: userIds.map((u) => people.find((p) => p.userId === u)).filter((p): p is (typeof people)[number] => !!p),
  };
  return NextResponse.json({ show });
}
