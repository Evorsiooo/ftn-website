import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { getPublishedArticles, getAllAdminArticles, createArticle, updateArticle } from "@/lib/articles";
import { verifySessionToken } from "@/lib/auth";
import { canPublishArticles } from "@/lib/rbac";
import { sanitizeHtml } from "@/lib/sanitize";

export const runtime = "edge";

const MAX_TITLE_LENGTH = 300;
const MAX_CONTENT_LENGTH = 20000;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || undefined;
    const author = searchParams.get("author") || undefined;
    const search = searchParams.get("search") || undefined;
    const adminMode = searchParams.get("admin") === "true";
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ articles: [] });
    }

    const db = getDb(d1);

    if (adminMode) {
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const user = await verifySessionToken(token);
      if (!user || !canPublishArticles(user.roles)) {
        return NextResponse.json({ error: "Forbidden: Digital Publishing role required" }, { status: 403 });
      }

      const all = await getAllAdminArticles(db);
      return NextResponse.json({ articles: all });
    }

    const articlesList = await getPublishedArticles(db, { category, author, search, limit, offset });
    return NextResponse.json({ articles: articlesList }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error: any) {
    console.error("Articles GET error:", error);
    return NextResponse.json({ error: "Failed to fetch articles" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized: Please sign in with Roblox" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || !canPublishArticles(user.roles)) {
      return NextResponse.json({ error: "Forbidden: Digital Publishing role required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const title = body?.title?.trim();
    const rawContent = body?.content || "";

    if (!title || title.length === 0) {
      return NextResponse.json({ error: "Article title is required" }, { status: 400 });
    }

    if (title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json({ error: `Title exceeds max length of ${MAX_TITLE_LENGTH} characters` }, { status: 400 });
    }

    if (rawContent.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: `Article content exceeds max length of ${MAX_CONTENT_LENGTH} characters` }, { status: 400 });
    }

    // Sanitize HTML Content against XSS
    const sanitizedContent = sanitizeHtml(rawContent);

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const db = getDb(d1);

    if (body.id) {
      // Update existing
      const updated = await updateArticle(
        db,
        body.id,
        {
          ...body,
          title,
          content: sanitizedContent,
        },
        user.id
      );
      return NextResponse.json({ article: updated });
    }

    // Create new
    const article = await createArticle(db, {
      ...body,
      title,
      content: sanitizedContent,
      authorId: user.id,
    });

    return NextResponse.json({ article }, { status: 201 });
  } catch (error: any) {
    console.error("Article save error:", error);
    return NextResponse.json({ error: "Failed to save article" }, { status: 500 });
  }
}
