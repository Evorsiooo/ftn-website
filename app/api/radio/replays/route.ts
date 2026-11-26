import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { radioReplays, radioShows } from "@/db/schema";
import { radioDb } from "@/lib/radio/store";

export const runtime = "edge";

/** Past shows to listen back to (newest first); ?show= one show's episodes. */
export async function GET(request: NextRequest) {
  const d1 = radioDb();
  if (!d1) return NextResponse.json({ replays: [] });
  const db = getDb(d1);
  const show = request.nextUrl.searchParams.get("show");
  // automated (playlist) shows' replays aren't listed: they filled the tab (Adrien, 2026-11-26)
  const where = [eq(radioReplays.hidden, false), ne(radioReplays.kind, "playlist"), lt(radioReplays.endedAt, new Date())];
  if (show) where.push(eq(radioReplays.showId, show));
  const rows = await db
    .select({ r: radioReplays, showName: radioShows.name, showArt: radioShows.artUrl })
    .from(radioReplays)
    .leftJoin(radioShows, eq(radioShows.id, radioReplays.showId))
    .where(and(...where))
    .orderBy(desc(radioReplays.startedAt))
    .limit(60);
  const replays = rows
    // shorter than a minute: a show started by mistake
    .filter(({ r }) => r.endedAt && r.endedAt.getTime() - r.startedAt.getTime() >= 60_000)
    .map(({ r, showName, showArt }) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      show: showName ?? null,
      art: r.artUrl ?? showArt ?? null,
      startedAt: r.startedAt.getTime(),
      endedAt: r.endedAt!.getTime(),
    }));
  return NextResponse.json({ replays }, { headers: { "Cache-Control": "public, max-age=60" } });
}
