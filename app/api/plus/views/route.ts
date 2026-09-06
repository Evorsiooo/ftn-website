import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { videoViews, videos } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const body = (await request.json().catch(() => ({}))) as { videoId?: string; youtubeId?: string };
    const rawId = (body.videoId || body.youtubeId)?.trim();

    if (!rawId) {
      return NextResponse.json({ error: "Missing video ID" }, { status: 400 });
    }

    // Rate Limiting: Max 10 view pings per minute per IP for the same video
    const targetKey = `view:${clientIp}:${rawId}`;
    const rateLimit = await checkRateLimit(targetKey, 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: true, message: "View rate limited" });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ success: true, message: "Local mock view recorded" });
    }

    const db = getDb(d1);

    // Resolve video by either UUID or YouTube ID
    const match = await db
      .select()
      .from(videos)
      .where(or(eq(videos.id, rawId), eq(videos.youtubeId, rawId)))
      .limit(1);

    const actualVideoId = match.length > 0 ? match[0].id : rawId;

    await db.insert(videoViews).values({
      id: crypto.randomUUID(),
      videoId: actualVideoId,
      viewedAt: new Date(),
    });

    return NextResponse.json({ success: true, videoId: actualVideoId });
  } catch (error: any) {
    console.error("View recording error:", error);
    return NextResponse.json({ error: "Failed to record view" }, { status: 500 });
  }
}
