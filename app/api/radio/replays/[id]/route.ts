import { NextRequest, NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { radioReplayParts, radioReplays, radioShows, users } from "@/db/schema";
import { radioDb } from "@/lib/radio/store";

export const runtime = "edge";

type Params = { params: Promise<{ id: string }> };

/** One replay and its parts: the running orders, voice recordings (with who is speaking) and pauses to rebuild it from. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const d1 = radioDb();
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const db = getDb(d1);
  const [row] = await db
    .select({ r: radioReplays, showName: radioShows.name, showArt: radioShows.artUrl })
    .from(radioReplays)
    .leftJoin(radioShows, eq(radioShows.id, radioReplays.showId))
    .where(eq(radioReplays.id, id));
  if (!row || row.r.hidden || !row.r.endedAt || row.r.endedAt.getTime() > Date.now()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parts = await db.select().from(radioReplayParts).where(eq(radioReplayParts.replayId, id)).orderBy(asc(radioReplayParts.startMs));
  // the people heard on the show, in the order they were first heard (their avatars on the replay)
  const userIds = [...new Set(parts.filter((p) => p.kind === "voice").map((p) => p.userId).filter((u): u is string => !!u))];
  const found = userIds.length
    ? await db.select({ id: users.id, name: users.robloxUsername, avatar: users.avatarUrl }).from(users).where(inArray(users.id, userIds))
    : [];
  const people = userIds.map((u) => found.find((p) => p.id === u)).filter((p): p is (typeof found)[number] => !!p);
  return NextResponse.json(
    {
      replay: {
        id,
        kind: row.r.kind,
        title: row.r.title,
        show: row.showName ?? null,
        art: row.r.artUrl ?? row.showArt ?? null,
        startedAt: row.r.startedAt.getTime(),
        endedAt: row.r.endedAt.getTime(),
      },
      timelines: parts.filter((p) => p.kind === "timeline").map((p) => p.r2Key),
      voices: parts.filter((p) => p.kind === "voice").map((p) => ({ key: p.r2Key, start: p.startMs, end: p.endMs, userId: p.userId })),
      people,
      pauses: parts.filter((p) => p.kind === "pause").map((p) => ({ start: p.startMs, end: p.endMs ?? row.r.endedAt!.getTime() })),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
