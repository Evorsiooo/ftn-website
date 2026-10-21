import { SignJWT, jwtVerify } from "jose";
import { eq, or, sql } from "drizzle-orm";
import { DbClient, getDb } from "@/db";
import { users, userRoles } from "@/db/schema";

export interface RobloxUser {
  id: string;
  robloxId: string;
  robloxUsername: string;
  displayName: string;
  avatarUrl?: string;
  roles: string[];
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || "ftn-media-group-internal-jwt-signing-secret";
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: RobloxUser): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string, db?: DbClient): Promise<RobloxUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const user = (payload.user as RobloxUser) || null;
    if (!user) return null;

    let liveRoles = user.roles || [];
    const d1 = !db ? ((process.env as any).DB as D1Database | undefined) : undefined;
    const dbClient = db || (d1 ? getDb(d1) : null);

    if (dbClient && user.id) {
      try {
        const assignedRoles = await dbClient
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(eq(userRoles.userId, user.id));

        const roleList = assignedRoles.map((r) => r.role);
        const normalized = (user.robloxUsername || "").toLowerCase();
        if ((normalized === "alphaze1" || normalized === "evorsio") && !roleList.includes("site_admin")) {
          roleList.push("site_admin");
        }
        liveRoles = roleList;
      } catch (err) {
        // Fallback to token payload roles if DB is inaccessible
      }
    }

    return {
      ...user,
      roles: liveRoles,
    };
  } catch {
    return null;
  }
}

export function getRobloxAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid profile",
    state: state,
  });
  return `https://apis.roblox.com/oauth/v1/authorize?${params.toString()}`;
}

export async function syncRobloxUserAndRoles(
  db: DbClient,
  robloxProfile: {
    robloxId: string;
    robloxUsername: string;
    displayName: string;
    avatarUrl?: string;
  }
): Promise<RobloxUser> {
  const normalizedUsername = (robloxProfile.robloxUsername || "").toLowerCase();
  const isAdmin = normalizedUsername === "alphaze1" || normalizedUsername === "evorsio";

  try {
    const existingUser = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.robloxId, robloxProfile.robloxId),
          sql`lower(${users.robloxUsername}) = ${normalizedUsername}`
        )
      )
      .limit(1);

    let userId: string;

    if (existingUser.length > 0) {
      userId = existingUser[0].id;
      try {
        await db
          .update(users)
          .set({
            robloxId: robloxProfile.robloxId,
            robloxUsername: robloxProfile.robloxUsername,
            displayName: robloxProfile.displayName,
            avatarUrl: robloxProfile.avatarUrl || existingUser[0].avatarUrl,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      } catch (err) {
        console.warn("User update fallback:", err);
      }
    } else {
      userId = crypto.randomUUID();
      try {
        await db.insert(users).values({
          id: userId,
          robloxId: robloxProfile.robloxId,
          robloxUsername: robloxProfile.robloxUsername,
          displayName: robloxProfile.displayName,
          avatarUrl: robloxProfile.avatarUrl || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (err) {
        console.warn("User insert fallback:", err);
      }
    }

    // Superuser seeding for root admin: alphaze1 or evorsio
    if (isAdmin) {
      try {
        const existingAdminRole = await db
          .select()
          .from(userRoles)
          .where(eq(userRoles.userId, userId));

        const hasAdmin = existingAdminRole.some((r) => r.role === "site_admin");
        if (!hasAdmin) {
          await db.insert(userRoles).values({
            id: crypto.randomUUID(),
            userId: userId,
            role: "site_admin",
            assignedAt: new Date(),
          });
        }
      } catch (err) {
        console.warn("Admin role seeding fallback:", err);
      }
    }

    // Retrieve all assigned roles
    let roleList: string[] = [];
    try {
      const assignedRoles = await db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, userId));

      roleList = assignedRoles.map((r) => r.role);
    } catch (err) {
      console.warn("Role lookup fallback:", err);
    }

    if (isAdmin && !roleList.includes("site_admin")) {
      roleList.push("site_admin");
    }

    return {
      id: userId,
      robloxId: robloxProfile.robloxId,
      robloxUsername: robloxProfile.robloxUsername,
      displayName: robloxProfile.displayName,
      avatarUrl: robloxProfile.avatarUrl,
      roles: roleList,
    };
  } catch (error) {
    console.error("syncRobloxUserAndRoles error:", error);
    return {
      id: crypto.randomUUID(),
      robloxId: robloxProfile.robloxId,
      robloxUsername: robloxProfile.robloxUsername,
      displayName: robloxProfile.displayName,
      avatarUrl: robloxProfile.avatarUrl,
      roles: isAdmin ? ["site_admin"] : [],
    };
  }
}
