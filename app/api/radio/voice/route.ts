import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { radioReplayParts, radioStudioPeople, radioStudioSessions } from "@/db/schema";
import { radioUser } from "@/lib/radio/admin-route";
import { noStore, radioBucket } from "@/lib/radio/store";

export const runtime = "edge";

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Replays: everyone on air records their own voice in their browser and sends it here a minute
 * at a time (?start= server ms the piece begins, &dur= its length in ms). Each piece is a file of
 * its own, so the recording survives any one person leaving.
 */
export async function POST(request: NextRequest) {
  const ctx = await radioUser(request);
  if ("error" in ctx) return ctx.error;
  const bucket = radioBucket();
  if (!bucket) return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  const start = Number(request.nextUrl.searchParams.get("start"));
  const dur = Number(request.nextUrl.searchParams.get("dur"));
  if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0 || dur > 5 * 60_000 || Math.abs(start - Date.now()) > 15 * 60_000) {
    return NextResponse.json({ error: "Bad times" }, { status: 400 });
  }
  // someone on air in a show now, or until a moment ago (the last piece arrives after they leave)
  const [row] = await ctx.db
    .select({ person: radioStudioPeople, replayId: radioStudioSessions.replayId })
    .from(radioStudioPeople)
    .innerJoin(radioStudioSessions, eq(radioStudioSessions.id, radioStudioPeople.sessionId))
    .where(and(eq(radioStudioPeople.userId, ctx.user.id), ne(radioStudioPeople.state, "waiting"), gt(radioStudioPeople.seenAt, new Date(Date.now() - 120_000))))
    .orderBy(desc(radioStudioPeople.joinedAt))
    .limit(1);
  if (!row?.replayId) return NextResponse.json({ error: "You're not on air" }, { status: 403 });
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > MAX_BYTES) return NextResponse.json({ error: "Bad size" }, { status: 413 });
  const type = (request.headers.get("content-type") || "audio/webm").split(";")[0]!.slice(0, 40);
  const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
  const key = `replays/${row.replayId}/voice/${row.person.id}-${Math.round(start)}.${ext}`;
  await bucket.put(key, data, { httpMetadata: { contentType: type } });
  await ctx.db.insert(radioReplayParts).values({ replayId: row.replayId, kind: "voice", r2Key: key, startMs: Math.round(start), endMs: Math.round(start + dur), userId: ctx.user.id });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
