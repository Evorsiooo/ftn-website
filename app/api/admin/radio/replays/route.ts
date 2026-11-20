import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { radioReplays } from "@/db/schema";
import { failure, radioAdmin } from "@/lib/radio/admin-route";

export const runtime = "edge";

/** Every replay, hidden ones included (the Studio's list). */
export async function GET(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  try {
    const rows = await ctx.db.select().from(radioReplays).orderBy(desc(radioReplays.startedAt)).limit(100);
    return NextResponse.json({
      replays: rows.map((r) => ({ id: r.id, kind: r.kind, airingKey: r.airingKey, title: r.title, showId: r.showId, hidden: r.hidden, startedAt: r.startedAt.getTime(), endedAt: r.endedAt?.getTime() ?? null })),
    });
  } catch (err) {
    return failure(err, "Could not load replays");
  }
}
