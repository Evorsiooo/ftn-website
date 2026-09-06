import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  getArticleBySlug,
  getArticleRevisions,
  revertArticleToRevision,
} from "@/lib/articles";
import { verifySessionToken } from "@/lib/auth";
import { canPublishArticles } from "@/lib/rbac";

export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const authHeader = request.headers.get("authorization");
    const token =
      authHeader?.replace("Bearer ", "") ||
      request.cookies.get("ftn_session")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || !canPublishArticles(user.roles)) {
      return NextResponse.json(
        { error: "Forbidden: Digital Publishing role required" },
        { status: 403 }
      );
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ revisions: [] });
    }

    const db = getDb(d1);
    const article = await getArticleBySlug(db, slug);
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const revisions = await getArticleRevisions(db, article.id);
    return NextResponse.json({ revisions });
  } catch (error: any) {
    console.error("Fetch revisions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch revisions" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const authHeader = request.headers.get("authorization");
    const token =
      authHeader?.replace("Bearer ", "") ||
      request.cookies.get("ftn_session")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || !canPublishArticles(user.roles)) {
      return NextResponse.json(
        { error: "Forbidden: Digital Publishing role required" },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      revisionId?: string;
    };

    if (!body?.revisionId) {
      return NextResponse.json(
        { error: "Missing revision ID" },
        { status: 400 }
      );
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 500 }
      );
    }

    const db = getDb(d1);
    const article = await getArticleBySlug(db, slug);
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const reverted = await revertArticleToRevision(
      db,
      article.id,
      body.revisionId,
      user.id
    );

    return NextResponse.json({
      success: true,
      article: reverted,
      message: "Article reverted successfully",
    });
  } catch (error: any) {
    console.error("Revert revision error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to revert article" },
      { status: 500 }
    );
  }
}
