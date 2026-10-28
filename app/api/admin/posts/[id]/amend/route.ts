import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { canManagePosts, isPostsLeadership } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { amendmentsOf, refreshPostMessages } from "@/lib/discord-posts";

export const runtime = "edge";

const MAX_NOTE = 300;
const MAX_NOTES = 10;

// Adds an "edit: ..." note to a post and shows it on the #ftn-plus and feed messages.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireStaff(request, canManagePosts, "Forbidden: Staff permissions required");
    if ("error" in auth) return auth.error;
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const note = (body.note || "").replace(/\s+/g, " ").trim();
    if (!note || note.length > MAX_NOTE) {
      return NextResponse.json({ error: `The note must be 1 to ${MAX_NOTE} characters` }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (rows.length === 0) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const post = rows[0];
    if (auth.user.id !== post.createdBy && !isPostsLeadership(auth.user.roles)) {
      return NextResponse.json({ error: "Only the creator or leadership can add an edit note" }, { status: 403 });
    }
    if (post.status === "draft") {
      return NextResponse.json({ error: "Generate the draft before adding edit notes" }, { status: 409 });
    }
    if (post.status === "denied") {
      return NextResponse.json({ error: "A denied post cannot be amended" }, { status: 409 });
    }
    const notes = amendmentsOf(post);
    if (notes.length >= MAX_NOTES) {
      return NextResponse.json({ error: `A post can have at most ${MAX_NOTES} edit notes` }, { status: 409 });
    }

    await db
      .update(posts)
      .set({ amendments: JSON.stringify([...notes, note]), updatedAt: new Date() })
      .where(eq(posts.id, id));

    const discord = await refreshPostMessages(db, id, { ftnPlus: true, feed: true });
    return NextResponse.json({ success: true, discordWarning: discord.ok ? undefined : discord.error });
  } catch (error) {
    console.error("Amend post error:", error);
    return NextResponse.json({ error: "Failed to add the edit note" }, { status: 500 });
  }
}
