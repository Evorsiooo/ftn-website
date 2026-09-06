import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { userModeration, users } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "edge";

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

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || (!user.roles.includes("site_admin") && !user.roles.includes("manager"))) {
      return NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ moderations: [] });
    }

    const db = getDb(d1);
    const records = await db
      .select({
        id: userModeration.id,
        userId: userModeration.userId,
        reason: userModeration.reason,
        duration: userModeration.duration,
        expiresAt: userModeration.expiresAt,
        moderatedBy: userModeration.moderatedBy,
        createdAt: userModeration.createdAt,
        robloxUsername: users.robloxUsername,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(userModeration)
      .leftJoin(users, eq(userModeration.userId, users.id))
      .orderBy(desc(userModeration.createdAt));

    return NextResponse.json({ moderations: records });
  } catch (error: any) {
    console.error("Fetch moderation records error:", error);
    return NextResponse.json({ error: "Failed to fetch moderations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(`mod_action:${clientIp}`, 15, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Too many moderation requests. Please slow down." }, { status: 429 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || (!user.roles.includes("site_admin") && !user.roles.includes("manager"))) {
      return NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      userId?: string;
      duration?: "24h" | "1w" | "1m" | "indefinite";
      reason?: string;
    };

    const targetUserId = body.userId?.trim();
    const duration = body.duration || "24h";
    const reason = (body.reason?.trim() || "Violation of community rules").slice(0, 500);

    const VALID_DURATIONS = ["24h", "1w", "1m", "indefinite"];
    if (!VALID_DURATIONS.includes(duration)) {
      return NextResponse.json({ error: "Invalid mute duration specified" }, { status: 400 });
    }

    if (!targetUserId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const db = getDb(d1);

    // Guard: Prevent muting alphaze1 or evorsio
    const target = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
    if (target.length > 0) {
      const normUsername = target[0].robloxUsername.toLowerCase();
      if (normUsername === "alphaze1" || normUsername === "evorsio") {
        return NextResponse.json({ error: `Root Administrator @${target[0].robloxUsername} cannot be muted.` }, { status: 403 });
      }
    }

    const expiresAt = calculateExpiration(duration);

    // Remove any existing active mute for this user
    await db.delete(userModeration).where(eq(userModeration.userId, targetUserId));

    const id = crypto.randomUUID();
    await db.insert(userModeration).values({
      id,
      userId: targetUserId,
      reason,
      duration,
      expiresAt,
      moderatedBy: user.robloxUsername || user.displayName || user.id,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, message: `User muted (${duration})` });
  } catch (error: any) {
    console.error("Apply moderation error:", error);
    return NextResponse.json({ error: "Failed to apply moderation" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || (!user.roles.includes("site_admin") && !user.roles.includes("manager"))) {
      return NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const moderationId = searchParams.get("id");
    const targetUserId = searchParams.get("userId");

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const db = getDb(d1);

    if (moderationId) {
      await db.delete(userModeration).where(eq(userModeration.id, moderationId));
    } else if (targetUserId) {
      await db.delete(userModeration).where(eq(userModeration.userId, targetUserId));
    } else {
      return NextResponse.json({ error: "Missing moderation ID or user ID" }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "User unmuted" });
  } catch (error: any) {
    console.error("Unmute error:", error);
    return NextResponse.json({ error: "Failed to unmute user" }, { status: 500 });
  }
}
