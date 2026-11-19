import { NextRequest, NextResponse } from "next/server";
import { utcDay } from "@/lib/stats/collect";

export const runtime = "edge";

/**
 * Watch time for the Stats page: the FTN+ player sends this once when a viewer leaves a video
 * (navigator.sendBeacon): seconds actually played and how far they got (0..1). Anonymous; one row
 * per video per day. Only videos in the catalog count.
 */
export async function POST(request: NextRequest) {
  const db = (process.env as any).DB as D1Database | undefined;
  if (!db) return new NextResponse(null, { status: 204 });
  const raw = await request.text().catch(() => "");
  if (raw.length > 500) return new NextResponse(null, { status: 413 });
  let body: { youtubeId?: unknown; seconds?: unknown; reached?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const id = typeof body.youtubeId === "string" ? body.youtubeId : "";
  const seconds = Math.min(6 * 3600, Math.max(0, Math.round(Number(body.seconds) || 0)));
  const reached = Math.min(1, Math.max(0, Number(body.reached) || 0));
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id) || seconds < 5) return new NextResponse(null, { status: 204 });
  try {
    const known = await db.prepare("SELECT duration_seconds AS d FROM videos WHERE youtube_id = ?").bind(id).first<{ d: number | null }>();
    if (!known) return new NextResponse(null, { status: 204 });
    const cap = known.d && known.d > 0 ? Math.min(seconds, known.d * 2) : seconds;
    await db
      .prepare(
        `INSERT INTO stat_watch_days (day, youtube_id, sessions, seconds, q25, q50, q75, q100) VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(day, youtube_id) DO UPDATE SET sessions = sessions + 1, seconds = seconds + ?3,
           q25 = q25 + ?4, q50 = q50 + ?5, q75 = q75 + ?6, q100 = q100 + ?7`,
      )
      .bind(utcDay(), id, cap, reached >= 0.25 ? 1 : 0, reached >= 0.5 ? 1 : 0, reached >= 0.75 ? 1 : 0, reached >= 0.95 ? 1 : 0)
      .run();
  } catch {
    // statistics never break the player
  }
  return new NextResponse(null, { status: 204 });
}
