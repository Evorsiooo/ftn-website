import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adCampaigns, posts } from "@/db/schema";
import { canManagePosts, isPostsLeadership } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { deletePostMessages, refreshPostMessages } from "@/lib/discord-posts";
import { PostInput, consumeAdImpression, releaseAdImpression, resolveMessageLink, validatePostInput } from "@/lib/posts";

export const runtime = "edge";

const FORBIDDEN = "Forbidden: Staff permissions required";

// Only the creator or leadership may change or delete a post.
function canChange(user: { id: string; roles: string[] }, createdBy: string): boolean {
  return user.id === createdBy || isPostsLeadership(user.roles);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaff(request, canManagePosts, FORBIDDEN);
    if ("error" in auth) return auth.error;
    const { id } = await params;

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

    const rows = await getDb(d1).select().from(posts).where(eq(posts.id, id)).limit(1);
    if (rows.length === 0) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    return NextResponse.json({ post: rows[0] });
  } catch (error) {
    console.error("Load post error:", error);
    return NextResponse.json({ error: "Failed to load post" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaff(request, canManagePosts, FORBIDDEN);
    if ("error" in auth) return auth.error;
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as PostInput;
    const parsed = validatePostInput(body, false);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (rows.length === 0) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const existing = rows[0];
    if (!canChange(auth.user, existing.createdBy)) {
      return NextResponse.json({ error: "Only the creator or leadership can edit this post" }, { status: 403 });
    }
    if (existing.status !== "pending") {
      return NextResponse.json({ error: "Only posts waiting for approval can be edited" }, { status: 409 });
    }

    const values = { ...parsed.values, updatedAt: new Date() } as Record<string, unknown>;

    if (body.adId !== undefined && (body.adId || null) !== existing.adId) {
      const newAdId = body.adId || null;
      if (newAdId) {
        const ad = await db.select().from(adCampaigns).where(eq(adCampaigns.id, newAdId)).limit(1);
        if (ad.length === 0 || ad[0].adFormat !== "1024x180") {
          return NextResponse.json({ error: "Ad not found" }, { status: 400 });
        }
        if (!(await consumeAdImpression(db, newAdId))) {
          return NextResponse.json({ error: "This ad has no post impressions left or is not active" }, { status: 409 });
        }
        values.organizationName = ad[0].advertiserName;
        values.messageLink = resolveMessageLink(ad[0]);
      } else {
        values.organizationName = null;
        values.messageLink = null;
      }
      await releaseAdImpression(db, existing.adId);
      values.adId = newAdId;
    }

    await db.update(posts).set(values).where(eq(posts.id, id));
    // Keep the Discord messages in step with the edit.
    const discord = await refreshPostMessages(db, id, { ftnPlus: true, leadership: true, image: body.imageUrl !== undefined || body.videoUrl !== undefined });
    return NextResponse.json({ success: true, discordWarning: discord.ok ? undefined : discord.error });
  } catch (error) {
    console.error("Update post error:", error);
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaff(request, canManagePosts, FORBIDDEN);
    if ("error" in auth) return auth.error;
    const { id } = await params;

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (rows.length === 0) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (!canChange(auth.user, rows[0].createdBy)) {
      return NextResponse.json({ error: "Only the creator or leadership can delete this post" }, { status: 403 });
    }

    // Remove it from #ftn-plus, #leadership and the feed first. If Discord refuses, keep the
    // post so it can be deleted again instead of leaving orphan messages behind.
    const discord = await deletePostMessages(rows[0]);
    if (!discord.ok) {
      return NextResponse.json({ error: `Could not delete the Discord messages: ${discord.error}` }, { status: 502 });
    }

    // Deleting gives the impression back, except for a denied post, which already gave it back.
    if (rows[0].status !== "denied") await releaseAdImpression(db, rows[0].adId);
    await db.delete(posts).where(eq(posts.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete post error:", error);
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}
