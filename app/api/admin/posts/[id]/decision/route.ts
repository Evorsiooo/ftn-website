import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { isPostsLeadership } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { releaseAdImpression } from "@/lib/posts";

export const runtime = "edge";

// Leadership approves or denies a pending post from the website.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaff(request, isPostsLeadership, "Forbidden: Leadership role required");
    if ("error" in auth) return auth.error;
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as { decision?: string; reason?: string };
    if (body.decision !== "approve" && body.decision !== "deny") {
      return NextResponse.json({ error: "Decision must be approve or deny" }, { status: 400 });
    }
    const reason = body.reason?.trim() || "";
    if (body.decision === "deny" && (!reason || reason.length > 500)) {
      return NextResponse.json({ error: "A reason of 1 to 500 characters is required to deny" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    // Only a pending post can be decided, and only once.
    const updated = await db
      .update(posts)
      .set({
        status: body.decision === "approve" ? "approved" : "denied",
        denyReason: body.decision === "deny" ? reason : null,
        decidedBy: auth.user.id,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(posts.id, id), eq(posts.status, "pending")))
      .returning({ id: posts.id, adId: posts.adId });
    if (updated.length === 0) {
      return NextResponse.json({ error: "This post was already decided or does not exist" }, { status: 409 });
    }

    // A denied post is never published, so its ad impression is given back.
    if (body.decision === "deny") await releaseAdImpression(db, updated[0].adId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Post decision error:", error);
    return NextResponse.json({ error: "Failed to save decision" }, { status: 500 });
  }
}
