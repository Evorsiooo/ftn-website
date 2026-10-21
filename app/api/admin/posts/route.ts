import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adCampaigns, posts, users } from "@/db/schema";
import { canManagePosts } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { sendPostToDiscord } from "@/lib/discord-posts";
import { PostInput, consumeAdImpression, releaseAdImpression, resolveMessageLink, validatePostInput } from "@/lib/posts";

export const runtime = "edge";

const FORBIDDEN = "Forbidden: Staff permissions required";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManagePosts, FORBIDDEN);
    if ("error" in auth) return auth.error;

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ posts: [] });

    const rows = await getDb(d1)
      .select({ post: posts, creatorName: users.displayName })
      .from(posts)
      .leftJoin(users, eq(users.id, posts.createdBy))
      .orderBy(desc(posts.createdAt))
      .limit(200);
    return NextResponse.json({
      posts: rows.map((r) => ({ ...r.post, creatorName: r.creatorName })),
    });
  } catch (error) {
    console.error("Load posts error:", error);
    return NextResponse.json({ error: "Failed to load posts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManagePosts, FORBIDDEN);
    if ("error" in auth) return auth.error;

    const body = (await request.json().catch(() => ({}))) as PostInput;
    const parsed = validatePostInput(body, true);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);

    let organizationName: string | null = null;
    let messageLink: string | null = null;
    const adId = body.adId || null;
    if (adId) {
      const ad = await db.select().from(adCampaigns).where(eq(adCampaigns.id, adId)).limit(1);
      if (ad.length === 0 || ad[0].adFormat !== "1024x180") {
        return NextResponse.json({ error: "Ad not found" }, { status: 400 });
      }
      if (!(await consumeAdImpression(db, adId))) {
        return NextResponse.json({ error: "This ad has no post impressions left or is not active" }, { status: 409 });
      }
      organizationName = ad[0].advertiserName;
      messageLink = resolveMessageLink(ad[0]);
    }

    const post = {
      id: crypto.randomUUID(),
      ...(parsed.values as any),
      body: (parsed.values as any).body ?? "",
      logo: (parsed.values as any).logo ?? "",
      backgroundUrl: (parsed.values as any).backgroundUrl ?? null,
      adId,
      organizationName,
      messageLink,
      status: "pending" as const,
      createdBy: auth.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      await db.insert(posts).values(post);
    } catch (err) {
      await releaseAdImpression(db, adId);
      throw err;
    }
    // Send it to #ftn-plus and #leadership. The post is saved either way; if Discord fails
    // the page offers a Resend button.
    const discord = await sendPostToDiscord(db, post.id);
    return NextResponse.json({ post, discordWarning: discord.ok ? undefined : discord.error }, { status: 201 });
  } catch (error) {
    console.error("Create post error:", error);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
