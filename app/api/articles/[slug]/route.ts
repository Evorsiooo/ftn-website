import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { getArticleBySlug, updateArticle } from "@/lib/articles";
import { verifySessionToken } from "@/lib/auth";
import { canPublishArticles } from "@/lib/rbac";
import { articles } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const db = getDb(d1);
    const article = await getArticleBySlug(db, slug);
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    // Hide non-published (archived/draft) articles from public view
    if (article.status !== "published") {
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
      const user = token ? await verifySessionToken(token) : null;
      if (!user || !canPublishArticles(user.roles)) {
        return NextResponse.json({ error: "Article not found" }, { status: 404 });
      }
    }

    return NextResponse.json({ article }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch article" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || !canPublishArticles(user.roles)) {
      return NextResponse.json({ error: "Forbidden: Digital Publishing role required" }, { status: 403 });
    }

    const d1 = (process.env as any).DB as D1Database;
    const db = getDb(d1);
    const existing = await getArticleBySlug(db, slug);
    if (!existing) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const title = body?.title?.trim();
    const rawContent = body?.content || "";
    const category = body?.category;
    const status = body?.status;
    const coverImageUrl = body?.coverImageUrl?.trim();

    if (title && title.length > 300) {
      return NextResponse.json({ error: "Title exceeds maximum length of 300 characters" }, { status: 400 });
    }

    if (rawContent && rawContent.length > 20000) {
      return NextResponse.json({ error: "Article content exceeds maximum length of 20,000 characters" }, { status: 400 });
    }

    const VALID_CATEGORIES = ["news", "politics", "business", "technology", "entertainment", "opinion"];
    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const VALID_STATUSES = ["draft", "published", "archived"];
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    if (coverImageUrl && !coverImageUrl.startsWith("http://") && !coverImageUrl.startsWith("https://") && !coverImageUrl.startsWith("/")) {
      return NextResponse.json({ error: "Invalid cover image URL" }, { status: 400 });
    }

    const { sanitizeHtml } = await import("@/lib/sanitize");
    const sanitizedContent = rawContent ? sanitizeHtml(rawContent) : undefined;

    const updated = await updateArticle(
      db,
      existing.id,
      {
        ...body,
        title: title || existing.title,
        content: sanitizedContent !== undefined ? sanitizedContent : existing.content,
        category: category || existing.category,
        status: status || existing.status,
        coverImageUrl: coverImageUrl !== undefined ? coverImageUrl : existing.coverImageUrl,
      },
      user.id
    );
    return NextResponse.json({ article: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update article" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || !canPublishArticles(user.roles)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const d1 = (process.env as any).DB as D1Database;
    const db = getDb(d1);
    await db.delete(articles).where(eq(articles.slug, slug));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete article" }, { status: 500 });
  }
}
