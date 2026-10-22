import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { watchProgress, videos } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { and, desc, eq } from "drizzle-orm";

export const runtime = "edge";

const MAX_ITEMS = 12;

async function currentUser(request: NextRequest) {
  const token =
    request.cookies.get("ftn_session")?.value || request.headers.get("authorization")?.replace("Bearer ", "");
  return token ? verifySessionToken(token) : null;
}

// Signed-in viewers' unfinished videos, most recent first.
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser(request);
    const d1 = (process.env as any).DB as D1Database;
    if (!user || !d1) return NextResponse.json({ items: [] });

    const items = await getDb(d1)
      .select({
        youtubeId: watchProgress.youtubeId,
        position: watchProgress.positionSeconds,
        duration: watchProgress.durationSeconds,
        updatedAt: watchProgress.updatedAt,
        title: videos.title,
        thumbnailUrl: videos.thumbnailUrl,
        channelId: videos.channelId,
        channelTitle: videos.channelTitle,
        channelLogoUrl: videos.channelLogoUrl,
      })
      .from(watchProgress)
      .innerJoin(videos, eq(watchProgress.youtubeId, videos.youtubeId))
      .where(eq(watchProgress.userId, user.id))
      .orderBy(desc(watchProgress.updatedAt))
      .limit(MAX_ITEMS);

    return NextResponse.json({ items: items.map((i) => ({ ...i, updatedAt: i.updatedAt.getTime() })) });
  } catch (error) {
    console.error("Progress GET error:", error);
    return NextResponse.json({ items: [] });
  }
}

// Upsert a position, or clear the row when the video is finished.
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ success: false }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      youtubeId?: string;
      position?: number;
      duration?: number;
    };
    const youtubeId = (body.youtubeId || "").replace(/[^a-zA-Z0-9_\-]/g, "");
    const position = Math.floor(Number(body.position));
    const duration = Math.floor(Number(body.duration));
    if (!youtubeId || !Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position < 0) {
      return NextResponse.json({ error: "Invalid progress" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ success: true });
    const db = getDb(d1);

    if (position / duration >= 0.95) {
      await db.delete(watchProgress).where(and(eq(watchProgress.userId, user.id), eq(watchProgress.youtubeId, youtubeId)));
      return NextResponse.json({ success: true, cleared: true });
    }

    const now = new Date();
    await db
      .insert(watchProgress)
      .values({ userId: user.id, youtubeId, positionSeconds: position, durationSeconds: duration, updatedAt: now })
      .onConflictDoUpdate({
        target: [watchProgress.userId, watchProgress.youtubeId],
        set: { positionSeconds: position, durationSeconds: duration, updatedAt: now },
      });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Progress POST error:", error);
    return NextResponse.json({ error: "Failed to save progress" }, { status: 500 });
  }
}
