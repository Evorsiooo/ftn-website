import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users, userRoles, siteSettings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { createSessionToken } from "@/lib/auth";
import { verifyPassword, hashPassword } from "@/lib/crypto";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const body = (await request.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
    };

    const rawUsername = body?.username?.trim() || "";
    const password = body?.password || "";

    if (!rawUsername || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 }
      );
    }

    // 1. Rate Limiting: Max 5 failed attempts per IP / username per minute
    const rateLimit = await checkRateLimit(
      `login:${clientIp}:${rawUsername.toLowerCase()}`,
      5,
      60
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Too many login attempts. Please wait ${rateLimit.resetInSeconds} seconds before trying again.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.resetInSeconds) },
        }
      );
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json(
        { error: "Authentication database unavailable." },
        { status: 500 }
      );
    }

    const db = getDb(d1);

    // 2. Look up user by lowercase Roblox username
    const normalized = rawUsername.toLowerCase();
    const userRows = await db
      .select()
      .from(users)
      .where(sql`lower(${users.robloxUsername}) = ${normalized}`)
      .limit(1);

    if (userRows.length === 0) {
      // Dummy hash computation to prevent user enumeration timing attacks
      await hashPassword(password);
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    const user = userRows[0];

    if (!user.passwordHash || !user.passwordSalt) {
      // User has not been assigned a password yet
      await hashPassword(password);
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    // 4. Verify Password Hash
    const isValid = await verifyPassword(
      password,
      user.passwordHash,
      user.passwordSalt
    );

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    // 5. Retrieve User Roles
    const assignedRoles = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));

    const roleList = assignedRoles.map((r) => r.role);

    // Superuser root check for alphaze1 or evorsio
    if ((normalized === "alphaze1" || normalized === "evorsio") && !roleList.includes("site_admin")) {
      roleList.push("site_admin");
    }

    const sessionUser = {
      id: user.id,
      robloxId: user.robloxId || "",
      robloxUsername: user.robloxUsername,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl || undefined,
      roles: roleList,
    };

    // 6. Generate Session Token & Set Cookie
    const token = await createSessionToken(sessionUser);

    const response = NextResponse.json({
      success: true,
      user: sessionUser,
    });

    response.cookies.set("ftn_session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Authentication failed. Please try again." },
      { status: 500 }
    );
  }
}
