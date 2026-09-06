import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { userRoles, users } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { canAssignRoles } from "@/lib/rbac";
import { eq, and } from "drizzle-orm";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const token =
      request.cookies.get("ftn_session")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await verifySessionToken(token);
    if (!currentUser || !canAssignRoles(currentUser.roles)) {
      return NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      targetUserId: string;
      role: any;
      action: "grant" | "revoke";
    };

    const { targetUserId, role, action } = body;
    if (!targetUserId || !role || !action) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    if (action !== "grant" && action !== "revoke") {
      return NextResponse.json({ error: "Invalid action. Must be 'grant' or 'revoke'." }, { status: 400 });
    }

    const VALID_ROLES = [
      "site_admin",
      "manager",
      "broadcast_division",
      "digital_publishing",
      "commercial_division",
      "graphic_design",
      "sports_division",
    ];

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid division role specified." }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const db = getDb(d1);

    // Prevent revoking site_admin from alphaze1 or evorsio
    if (action === "revoke" && role === "site_admin") {
      const targetUser = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      if (targetUser.length > 0) {
        const normName = targetUser[0].robloxUsername.toLowerCase();
        if (normName === "alphaze1" || normName === "evorsio") {
          return NextResponse.json(
            { error: `Root Administrator permissions for @${targetUser[0].robloxUsername} are protected and cannot be revoked.` },
            { status: 403 }
          );
        }
      }
    }

    if (action === "grant") {
      const existing = await db
        .select()
        .from(userRoles)
        .where(and(eq(userRoles.userId, targetUserId), eq(userRoles.role, role)));

      if (existing.length === 0) {
        await db.insert(userRoles).values({
          id: crypto.randomUUID(),
          userId: targetUserId,
          role: role,
          assignedBy: currentUser.id,
          assignedAt: new Date(),
        });
      }
      return NextResponse.json({ success: true, message: "Role granted" });
    } else {
      await db
        .delete(userRoles)
        .where(and(eq(userRoles.userId, targetUserId), eq(userRoles.role, role)));
      return NextResponse.json({ success: true, message: "Role revoked" });
    }
  } catch (error: any) {
    console.error("Roles update error:", error);
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}
