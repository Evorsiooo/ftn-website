import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users, userRoles } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { canAssignRoles } from "@/lib/rbac";
import { like, or, eq, sql } from "drizzle-orm";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const token =
      request.cookies.get("ftn_session")?.value ||
      request.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await verifySessionToken(token);
    if (!currentUser || !canAssignRoles(currentUser.roles)) {
      return NextResponse.json({ error: "Forbidden: Administrator or Manager role required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ users: [] });
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
    
    let usersQuery = db.select().from(users);
    if (search) {
      usersQuery = db
        .select()
        .from(users)
        .where(
          or(
            like(users.robloxUsername, `%${search}%`),
            like(users.displayName, `%${search}%`)
          )!
        ) as any;
    }

    const allUsers = await usersQuery.limit(50);
    const allRoles = await db.select().from(userRoles);
    const granterIds = Array.from(new Set(allRoles.map((r) => r.assignedBy).filter(Boolean) as string[]));
    const granters = granterIds.length ? await db.select().from(users).where(sql`${users.id} in (${sql.join(granterIds.map((g) => sql`${g}`), sql`, `)})`) : [];
    const granterName = (id?: string | null) => (id ? granters.find((g) => g.id === id)?.robloxUsername ?? null : null);

    const enrichedUsers = allUsers.map((u) => {
      const roles = allRoles.filter((r) => r.userId === u.id).map((r) => r.role);
      return {
        id: u.id,
        robloxId: u.robloxId,
        robloxUsername: u.robloxUsername,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt,
        roles,
        grants: allRoles
          .filter((r) => r.userId === u.id)
          .map((r) => ({ role: r.role, at: r.assignedAt ? new Date(r.assignedAt).toISOString() : null, by: granterName(r.assignedBy) })),
      };
    });

    // If no search query was provided, only return users who have assigned roles
    const filtered = search
      ? enrichedUsers
      : enrichedUsers.filter((u) => u.roles.length > 0);

    return NextResponse.json({ users: filtered });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch users" }, { status: 500 });
  }
}
