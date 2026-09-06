import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users, userRoles } from "@/db/schema";
import { eq, sql, and, ne } from "drizzle-orm";
import { verifySessionToken } from "@/lib/auth";
import { canAssignRoles } from "@/lib/rbac";
import {
  hashPassword,
  generateSecurePassword,
  fetchRobloxPublicProfile,
} from "@/lib/crypto";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token =
      authHeader?.replace("Bearer ", "") ||
      request.cookies.get("ftn_session")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await verifySessionToken(token);
    if (!currentUser || !canAssignRoles(currentUser.roles)) {
      return NextResponse.json(
        { error: "Forbidden: Administrator role required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ employees: [] });
    }

    const db = getDb(d1);

    // Auto-cleanup duplicate AlphaZe1 orphan account if Evorsio @alphaze1 is present
    try {
      const alphaUsers = await db
        .select()
        .from(users)
        .where(sql`lower(${users.robloxUsername}) = 'alphaze1'`);

      if (alphaUsers.length > 1) {
        const realUser = alphaUsers.find((u) => u.displayName.toLowerCase() === "evorsio");
        if (realUser) {
          const orphanUsers = alphaUsers.filter((u) => u.id !== realUser.id);
          for (const orphan of orphanUsers) {
            await db.delete(userRoles).where(eq(userRoles.userId, orphan.id));
            await db.delete(users).where(eq(users.id, orphan.id));
          }
        }
      }
    } catch {}

    if (!search) {
      return NextResponse.json({ employees: [] });
    }

    const foundUsers = await db
      .select()
      .from(users)
      .where(
        sql`lower(${users.robloxUsername}) LIKE ${`%${search.toLowerCase()}%`} OR lower(${users.displayName}) LIKE ${`%${search.toLowerCase()}%`}`
      )
      .limit(20);

    const allRoles = await db.select().from(userRoles);

    const mapped = foundUsers.map((u) => {
      const userAssignedRoles = allRoles
        .filter((r) => r.userId === u.id)
        .map((r) => r.role);

      return {
        id: u.id,
        robloxId: u.robloxId,
        robloxUsername: u.robloxUsername,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        hasPassword: !!(u.passwordHash && u.passwordSalt),
        roles: userAssignedRoles,
        createdAt: u.createdAt,
      };
    });

    return NextResponse.json({ employees: mapped });
  } catch (error: any) {
    console.error("Fetch employees error:", error);
    return NextResponse.json(
      { error: "Failed to fetch employees" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token =
      authHeader?.replace("Bearer ", "") ||
      request.cookies.get("ftn_session")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await verifySessionToken(token);
    if (!currentUser || !canAssignRoles(currentUser.roles)) {
      return NextResponse.json(
        { error: "Forbidden: Administrator role required" },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: "create" | "reset_password" | "fetch_preview" | "update_username";
      username?: string;
      userId?: string;
      newUsername?: string;
    };

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 500 }
      );
    }

    const db = getDb(d1);

    // 1. Preview Roblox Profile
    if (body.action === "fetch_preview") {
      const cleanUsername = body.username?.trim() || "";
      if (!cleanUsername || !/^[a-zA-Z0-9_]{3,20}$/.test(cleanUsername)) {
        return NextResponse.json(
          { error: "Invalid Roblox username. Must be 3-20 alphanumeric characters or underscores." },
          { status: 400 }
        );
      }
      const profile = await fetchRobloxPublicProfile(cleanUsername);
      return NextResponse.json({ profile });
    }

    // 2. Create Employee Account with Auto-Generated Password
    if (body.action === "create") {
      const rawUsername = body.username?.trim() || "";
      if (!rawUsername || !/^[a-zA-Z0-9_]{3,20}$/.test(rawUsername)) {
        return NextResponse.json(
          { error: "Invalid Roblox username. Must be 3-20 alphanumeric characters or underscores." },
          { status: 400 }
        );
      }

      // Fetch public profile info from Roblox
      const profile = await fetchRobloxPublicProfile(rawUsername);
      const plainPassword = generateSecurePassword();
      const { hashHex, saltHex } = await hashPassword(plainPassword);

      const normalized = rawUsername.toLowerCase();
      const existing = await db
        .select()
        .from(users)
        .where(sql`lower(${users.robloxUsername}) = ${normalized}`)
        .limit(1);

      let targetUserId: string;

      if (existing.length > 0) {
        targetUserId = existing[0].id;
        await db
          .update(users)
          .set({
            robloxId: profile.robloxId || existing[0].robloxId,
            displayName: profile.displayName || existing[0].displayName,
            avatarUrl: profile.avatarUrl || existing[0].avatarUrl,
            passwordHash: hashHex,
            passwordSalt: saltHex,
            updatedAt: new Date(),
          })
          .where(eq(users.id, targetUserId));
      } else {
        targetUserId = crypto.randomUUID();
        await db.insert(users).values({
          id: targetUserId,
          robloxId: profile.robloxId || null,
          robloxUsername: profile.robloxUsername,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl || null,
          passwordHash: hashHex,
          passwordSalt: saltHex,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Root superuser check for alphaze1 or evorsio
      if (normalized === "alphaze1" || normalized === "evorsio") {
        const adminRole = await db
          .select()
          .from(userRoles)
          .where(eq(userRoles.userId, targetUserId));

        if (!adminRole.some((r) => r.role === "site_admin")) {
          await db.insert(userRoles).values({
            id: crypto.randomUUID(),
            userId: targetUserId,
            role: "site_admin",
            assignedAt: new Date(),
          });
        }
      }

      return NextResponse.json({
        success: true,
        user: {
          id: targetUserId,
          robloxUsername: profile.robloxUsername,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        password: plainPassword,
      });
    }

    // 3. Reset Password
    if (body.action === "reset_password") {
      if (!body.userId) {
        return NextResponse.json(
          { error: "User ID is required" },
          { status: 400 }
        );
      }

      const plainPassword = generateSecurePassword();
      const { hashHex, saltHex } = await hashPassword(plainPassword);

      await db
        .update(users)
        .set({
          passwordHash: hashHex,
          passwordSalt: saltHex,
          updatedAt: new Date(),
        })
        .where(eq(users.id, body.userId));

      return NextResponse.json({
        success: true,
        password: plainPassword,
      });
    }

    // 4. Update Roblox Username
    if (body.action === "update_username") {
      const cleanNewUsername = body.newUsername?.trim() || "";
      if (!body.userId || !cleanNewUsername || !/^[a-zA-Z0-9_]{3,20}$/.test(cleanNewUsername)) {
        return NextResponse.json(
          { error: "Valid User ID and Roblox username (3-20 alphanumeric characters/underscores) are required" },
          { status: 400 }
        );
      }

      const normalizedNew = cleanNewUsername.toLowerCase();

      // Check if another account already uses this username
      const duplicate = await db
        .select()
        .from(users)
        .where(
          and(
            sql`lower(${users.robloxUsername}) = ${normalizedNew}`,
            ne(users.id, body.userId)
          )
        )
        .limit(1);

      if (duplicate.length > 0) {
        return NextResponse.json(
          { error: `The username @${cleanNewUsername} is already assigned to another user account.` },
          { status: 409 }
        );
      }

      const profile = await fetchRobloxPublicProfile(cleanNewUsername);

      await db
        .update(users)
        .set({
          robloxUsername: profile.robloxUsername,
          robloxId: profile.robloxId,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, body.userId));

      return NextResponse.json({
        success: true,
        profile,
      });
    }

    // 5. Delete User Account
    if (body.action === "delete_user") {
      if (!body.userId) {
        return NextResponse.json(
          { error: "User ID is required" },
          { status: 400 }
        );
      }

      if (body.userId === currentUser.id) {
        return NextResponse.json(
          { error: "Cannot delete your own active account." },
          { status: 400 }
        );
      }

      const target = await db.select().from(users).where(eq(users.id, body.userId)).limit(1);
      if (target.length > 0) {
        const norm = target[0].robloxUsername.toLowerCase();
        if (norm === "alphaze1" || norm === "evorsio") {
          return NextResponse.json(
            { error: `Root Administrator @${target[0].robloxUsername} is protected and cannot be deleted.` },
            { status: 403 }
          );
        }
      }

      await db.delete(userRoles).where(eq(userRoles.userId, body.userId));
      await db.delete(users).where(eq(users.id, body.userId));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Employee management error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process employee action" },
      { status: 500 }
    );
  }
}
