import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { canManagePosts, isPostsLeadership } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { dispatchScheduledPost, refreshPostMessages } from "@/lib/discord-posts";

export const runtime = "edge";

// Changes a scheduled post: move it to another time ({ scheduledAt }) or send it now ({ now: true }).
// Cancelling a schedule is a normal DELETE of the post.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaff(request, canManagePosts, "Forbidden: Staff permissions required");
    if ("error" in auth) return auth.error;
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { scheduledAt?: number; now?: boolean };

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (rows.length === 0) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (auth.user.id !== rows[0].createdBy && !isPostsLeadership(auth.user.roles)) {
      return NextResponse.json({ error: "Only the creator or leadership can change this schedule" }, { status: 403 });
    }
    if (!rows[0].scheduledAt) {
      return NextResponse.json({ error: "This post is not scheduled" }, { status: 409 });
    }

    if (body.now === true) {
      const result = await dispatchScheduledPost(db, id);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
      return NextResponse.json({ success: true });
    }

    const when = new Date(Number(body.scheduledAt));
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
      return NextResponse.json({ error: "The publish time must be in the future" }, { status: 400 });
    }
    await db.update(posts).set({ scheduledAt: when, updatedAt: new Date() }).where(eq(posts.id, id));
    // Leadership sees the new time on the review message.
    const discord = await refreshPostMessages(db, id, { leadership: true });
    return NextResponse.json({ success: true, discordWarning: discord.ok ? undefined : discord.error });
  } catch (error) {
    console.error("Schedule post error:", error);
    return NextResponse.json({ error: "Failed to change the schedule" }, { status: 500 });
  }
}
