import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { canManagePosts, isPostsLeadership } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { sendPostToDiscord } from "@/lib/discord-posts";

export const runtime = "edge";

// Retries sending a post to Discord when the first attempt failed. Only messages that were
// not created yet are sent.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaff(request, canManagePosts, "Forbidden: Staff permissions required");
    if ("error" in auth) return auth.error;
    const { id } = await params;

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (rows.length === 0) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (auth.user.id !== rows[0].createdBy && !isPostsLeadership(auth.user.roles)) {
      return NextResponse.json({ error: "Only the creator or leadership can resend this post" }, { status: 403 });
    }
    if (rows[0].status !== "pending") {
      return NextResponse.json({ error: "Only posts waiting for approval can be resent" }, { status: 409 });
    }

    const result = await sendPostToDiscord(db, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Resend post error:", error);
    return NextResponse.json({ error: "Failed to resend post" }, { status: 500 });
  }
}
