import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { getArticleBySlug, getArticleComments, addComment, deleteComment } from "@/lib/articles";
import { verifySessionToken } from "@/lib/auth";
import { siteSettings, comments, userModeration } from "@/db/schema";
import { eq, and, or, isNull, gt } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "edge";

const MAX_COMMENT_LENGTH = 500;

// In-memory violation counter fallback
const autoModViolationMap = new Map<string, { count: number; resetAt: number }>();

function calculateExpiration(duration: "24h" | "1w" | "1m" | "indefinite"): Date | null {
  const now = Date.now();
  switch (duration) {
    case "24h":
      return new Date(now + 24 * 60 * 60 * 1000);
    case "1w":
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    case "1m":
      return new Date(now + 30 * 24 * 60 * 60 * 1000);
    case "indefinite":
    default:
      return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ comments: [] });
    }

    const db = getDb(d1);
    const article = await getArticleBySlug(db, slug);
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const commentsList = await getArticleComments(db, article.id);
    return NextResponse.json({ comments: commentsList });
  } catch (error: any) {
    console.error("Fetch comments error:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "You must be signed in with Roblox to post comments." }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const db = getDb(d1);

    // 1. Check User Mute Status (Safely handled even if table is migrating)
    try {
      const now = new Date();
      const activeMute = await db
        .select()
        .from(userModeration)
        .where(
          and(
            eq(userModeration.userId, user.id),
            or(isNull(userModeration.expiresAt), gt(userModeration.expiresAt, now))
          )
        )
        .limit(1);

      if (activeMute.length > 0) {
        const mute = activeMute[0];
        const expiryText = mute.expiresAt ? `until ${new Date(mute.expiresAt).toLocaleDateString()}` : "indefinitely";
        return NextResponse.json(
          {
            error: `Your account is currently muted from posting comments ${expiryText}. Reason: ${mute.reason}`,
          },
          { status: 403 }
        );
      }
    } catch (muteErr) {
      // Table may be migrating or empty; log and proceed safely
      console.warn("User moderation check bypassed or table migrating:", muteErr);
    }

    // 2. Rate Limiting: Max 10 comments per 60 seconds per user
    const clientIp = getClientIp(request);
    const rateLimitKey = `comment:${user.id || clientIp}`;
    const rateLimit = await checkRateLimit(rateLimitKey, 10, 60);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Comment rate limit exceeded. Please wait ${rateLimit.resetInSeconds}s before posting again.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.resetInSeconds) },
        }
      );
    }

    // 3. Payload Validation & HTML Stripping
    const body = (await request.json().catch(() => ({}))) as { content?: string };
    let rawContent = body?.content?.trim() || "";
    const plainContent = rawContent.replace(/<[^>]*>/g, "").trim();

    if (!plainContent || plainContent.length === 0) {
      return NextResponse.json({ error: "Comment content is required." }, { status: 400 });
    }

    if (plainContent.length > MAX_COMMENT_LENGTH) {
      return NextResponse.json({
        error: `Comment exceeds character limit (${plainContent.length}/${MAX_COMMENT_LENGTH}).`,
      }, { status: 400 });
    }

    // 4. Check Profanity Filter & Auto-Moderation
    try {
      const settingsRows = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, "main_config"))
        .limit(1);

      if (settingsRows.length > 0) {
        const config = JSON.parse(settingsRows[0].valueJson);
        const bannedWords: string[] = (config.bannedWords || "")
          .split("\n")
          .map((w: string) => w.trim().toLowerCase())
          .filter(Boolean);

        const lowerContent = plainContent.toLowerCase();
        const foundBadWord = bannedWords.some((word) => {
          const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
          return regex.test(lowerContent);
        });

        if (foundBadWord) {
          // Check Auto-Moderation
          if (config.autoModEnabled) {
            const threshold = config.autoModThreshold || 3;
            const muteDuration = config.autoModMuteDuration || "24h";
            const vKey = user.id;
            const currentRecord = autoModViolationMap.get(vKey);
            const nowTime = Date.now();

            let violationCount = 1;
            if (currentRecord && currentRecord.resetAt > nowTime) {
              violationCount = currentRecord.count + 1;
            }
            autoModViolationMap.set(vKey, { count: violationCount, resetAt: nowTime + 300000 }); // 5 min window

            if (violationCount >= threshold) {
              try {
                // Automatically apply mute
                const expiresAt = calculateExpiration(muteDuration);
                await db.delete(userModeration).where(eq(userModeration.userId, user.id));
                await db.insert(userModeration).values({
                  id: crypto.randomUUID(),
                  userId: user.id,
                  reason: "Automated Mute: Repeated profanity violations",
                  duration: muteDuration,
                  expiresAt,
                  moderatedBy: "SYSTEM_AUTOMOD",
                  createdAt: new Date(),
                });
              } catch (autoErr) {
                console.warn("Auto-mod insert bypassed:", autoErr);
              }

              return NextResponse.json(
                {
                  error: `Your account has been automatically muted for ${muteDuration} due to repeated profanity violations.`,
                },
                { status: 403 }
              );
            }
          }

          return NextResponse.json({
            error: "Your comment contains prohibited language and cannot be posted.",
          }, { status: 400 });
        }
      }
    } catch (profanityErr) {
      console.warn("Profanity filter check error:", profanityErr);
    }

    const article = await getArticleBySlug(db, slug);
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const newComment = await addComment(db, article.id, user.id, plainContent);
    return NextResponse.json({ comment: newComment }, { status: 201 });
  } catch (error: any) {
    console.error("Post comment error:", error);
    return NextResponse.json({ error: "Failed to post comment" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const commentId = searchParams.get("commentId");
    if (!commentId) {
      return NextResponse.json({ error: "Missing comment ID" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const db = getDb(d1);

    // BOLA / IDOR Verification: Check comment ownership or Administrator role
    const commentMatch = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);

    if (commentMatch.length === 0) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const isOwner = commentMatch[0].userId === user.id;
    const isStaffAdmin = user.roles.some((r) => r === "site_admin" || r === "manager");

    if (!isOwner && !isStaffAdmin) {
      return NextResponse.json({ error: "Forbidden: You cannot delete another user's comment" }, { status: 403 });
    }

    await deleteComment(db, commentId);

    return NextResponse.json({ success: true, message: "Comment deleted" });
  } catch (error: any) {
    console.error("Delete comment error:", error);
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
