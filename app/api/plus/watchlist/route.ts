import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { watchlists, videos } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { eq, and, desc, or } from "drizzle-orm";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const token =
      request.cookies.get("ftn_session")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ watchlist: [], inWatchlist: false });
    }

    const user = await verifySessionToken(token);
    if (!user) {
      return NextResponse.json({ watchlist: [], inWatchlist: false });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ watchlist: [], inWatchlist: false });
    }

    const db = getDb(d1);
    const { searchParams } = new URL(request.url);
    const checkVideoId = searchParams.get("videoId")?.trim();

    // If checking status for a single video
    if (checkVideoId) {
      // Find matching video by id or youtubeId
      const targetVideo = await db
        .select()
        .from(videos)
        .where(or(eq(videos.id, checkVideoId), eq(videos.youtubeId, checkVideoId)))
        .limit(1);

      const actualVideoId = targetVideo.length > 0 ? targetVideo[0].id : checkVideoId;

      const existing = await db
        .select()
        .from(watchlists)
        .where(
          and(
            eq(watchlists.userId, user.id),
            or(
              eq(watchlists.videoId, actualVideoId),
              eq(watchlists.videoId, checkVideoId),
              eq(watchlists.id, checkVideoId)
            )
          )
        )
        .limit(1);

      return NextResponse.json({ inWatchlist: existing.length > 0 });
    }

    // Otherwise return full watchlist
    const items = await db
      .select({
        id: watchlists.id,
        addedAt: watchlists.addedAt,
        videoId: videos.id,
        youtubeId: videos.youtubeId,
        title: videos.title,
        description: videos.description,
        thumbnailUrl: videos.thumbnailUrl,
        channelId: videos.channelId,
        channelTitle: videos.channelTitle,
        channelLogoUrl: videos.channelLogoUrl,
      })
      .from(watchlists)
      .innerJoin(videos, eq(watchlists.videoId, videos.id))
      .where(eq(watchlists.userId, user.id))
      .orderBy(desc(watchlists.addedAt));

    return NextResponse.json({ watchlist: items });
  } catch (error: any) {
    console.error("Watchlist GET error:", error);
    return NextResponse.json({ error: "Failed to load watchlist" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token =
      request.cookies.get("ftn_session")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Sign in to save to watchlist" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      videoId?: string;
      action?: "add" | "remove" | "toggle";
    };
    const rawId = body.videoId?.trim();
    const action = body.action || "toggle";

    if (!rawId) {
      return NextResponse.json({ error: "Missing video ID" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ success: true, saved: action === "add" });
    }

    const db = getDb(d1);

    // Resolve target video by UUID or YouTube ID or watchlist ID
    const targetVideo = await db
      .select()
      .from(videos)
      .where(or(eq(videos.id, rawId), eq(videos.youtubeId, rawId)))
      .limit(1);

    const actualVideoId = targetVideo.length > 0 ? targetVideo[0].id : rawId;

    // Check if entry exists in watchlists
    const existing = await db
      .select()
      .from(watchlists)
      .where(
        and(
          eq(watchlists.userId, user.id),
          or(
            eq(watchlists.videoId, actualVideoId),
            eq(watchlists.videoId, rawId),
            eq(watchlists.id, rawId)
          )
        )
      );

    if (action === "remove" || (action === "toggle" && existing.length > 0)) {
      // Remove all matching entries for this user and video
      await db
        .delete(watchlists)
        .where(
          and(
            eq(watchlists.userId, user.id),
            or(
              eq(watchlists.videoId, actualVideoId),
              eq(watchlists.videoId, rawId),
              eq(watchlists.id, rawId)
            )
          )
        );
      return NextResponse.json({ success: true, saved: false, message: "Removed from watchlist" });
    } else {
      // Insert if not already existing
      if (existing.length === 0) {
        await db.insert(watchlists).values({
          id: crypto.randomUUID(),
          userId: user.id,
          videoId: actualVideoId,
          addedAt: new Date(),
        });
      }
      return NextResponse.json({ success: true, saved: true, message: "Added to watchlist" });
    }
  } catch (error: any) {
    console.error("Watchlist POST error:", error);
    return NextResponse.json({ error: "Watchlist update failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token =
      request.cookies.get("ftn_session")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawId = searchParams.get("videoId")?.trim() || searchParams.get("id")?.trim();

    if (!rawId) {
      return NextResponse.json({ error: "Missing videoId or id parameter" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ success: true, saved: false });
    }

    const db = getDb(d1);

    const targetVideo = await db
      .select()
      .from(videos)
      .where(or(eq(videos.id, rawId), eq(videos.youtubeId, rawId)))
      .limit(1);

    const actualVideoId = targetVideo.length > 0 ? targetVideo[0].id : rawId;

    await db
      .delete(watchlists)
      .where(
        and(
          eq(watchlists.userId, user.id),
          or(
            eq(watchlists.videoId, actualVideoId),
            eq(watchlists.videoId, rawId),
            eq(watchlists.id, rawId)
          )
        )
      );

    return NextResponse.json({ success: true, saved: false, message: "Removed from watchlist" });
  } catch (error: any) {
    console.error("Watchlist DELETE error:", error);
    return NextResponse.json({ error: "Watchlist deletion failed" }, { status: 500 });
  }
}
