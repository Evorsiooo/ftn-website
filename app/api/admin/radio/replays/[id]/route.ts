import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { radioReplayParts, radioReplays } from "@/db/schema";
import { failure, radioAdmin } from "@/lib/radio/admin-route";
import { radioBucket } from "@/lib/radio/store";

export const runtime = "edge";

type Params = { params: Promise<{ id: string }> };

/** Hide a replay from FTN+ (or show it again), or rename it. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { hidden?: unknown; title?: unknown };
  const set: Partial<typeof radioReplays.$inferInsert> = {};
  if (typeof body.hidden === "boolean") set.hidden = body.hidden;
  if (typeof body.title === "string" && body.title.trim()) set.title = body.title.trim().slice(0, 120);
  if (!Object.keys(set).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  try {
    await ctx.db.update(radioReplays).set(set).where(eq(radioReplays.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failure(err, "Could not update the replay");
  }
}

/** Deletes a replay for good: its recordings and saved running orders too. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  try {
    const bucket = radioBucket();
    if (bucket) {
      let cursor: string | undefined;
      do {
        const list = await bucket.list({ prefix: `replays/${id}/`, cursor });
        if (list.objects.length) await bucket.delete(list.objects.map((o) => o.key));
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);
    }
    await ctx.db.delete(radioReplayParts).where(eq(radioReplayParts.replayId, id));
    await ctx.db.delete(radioReplays).where(eq(radioReplays.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failure(err, "Could not delete the replay");
  }
}
