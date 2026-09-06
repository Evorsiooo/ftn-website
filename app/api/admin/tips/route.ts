import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { tips, users, userModeration } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { canPublishArticles } from "@/lib/rbac";
import { eq, desc, sql } from "drizzle-orm";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || !canPublishArticles(user.roles)) {
      return NextResponse.json({ error: "Forbidden: Digital Publishing or Admin role required" }, { status: 403 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ tips: [] });
    }

    const db = getDb(d1);
    const tipList = await db.select().from(tips).orderBy(desc(tips.createdAt)).limit(100);

    return NextResponse.json({ tips: tipList });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load tips" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || !canPublishArticles(user.roles)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      action?: "dismiss_all" | "blacklist";
    };

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ success: true });
    }

    const db = getDb(d1);

    // 1. Action: Dismiss All Unread Tips
    if (body.action === "dismiss_all") {
      await db.update(tips).set({ status: "dismissed" }).where(eq(tips.status, "unread"));
      return NextResponse.json({ success: true, message: "All unread tips have been dismissed." });
    }

    // 2. Action: Blacklist Submitter (Permanent Mute + Dismiss Tip)
    if (body.action === "blacklist" || body.status === "blacklist") {
      if (!body.id) {
        return NextResponse.json({ error: "Tip ID is required for blacklist action" }, { status: 400 });
      }

      const tipRow = await db.select().from(tips).where(eq(tips.id, body.id)).limit(1);
      if (tipRow.length === 0) {
        return NextResponse.json({ error: "Tip not found" }, { status: 404 });
      }

      const targetTip = tipRow[0];
      let mutedUser: any = null;

      // Extract user ID or Roblox username from contactChannel
      const contact = targetTip.contactChannel || "";
      const uidMatch = contact.match(/uid:([a-zA-Z0-9_-]+)/);
      const robloxMatch = contact.match(/roblox:@([a-zA-Z0-9_]+)/);

      if (uidMatch) {
        const u = await db.select().from(users).where(eq(users.id, uidMatch[1])).limit(1);
        if (u.length > 0) mutedUser = u[0];
      }

      if (!mutedUser && robloxMatch) {
        const u = await db
          .select()
          .from(users)
          .where(sql`lower(${users.robloxUsername}) = ${robloxMatch[1].toLowerCase()}`)
          .limit(1);
        if (u.length > 0) mutedUser = u[0];
      }

      if (mutedUser) {
        // Protect root admins alphaze1 and evorsio from blacklist/mute
        const normName = mutedUser.robloxUsername.toLowerCase();
        if (normName === "alphaze1" || normName === "evorsio") {
          return NextResponse.json(
            { error: `Root Administrator @${mutedUser.robloxUsername} is protected and cannot be blacklisted.` },
            { status: 403 }
          );
        }

        // Apply permanent site-wide mute
        await db.delete(userModeration).where(eq(userModeration.userId, mutedUser.id));
        await db.insert(userModeration).values({
          id: crypto.randomUUID(),
          userId: mutedUser.id,
          reason: "Permanent blacklist from Tipline abuse",
          duration: "indefinite",
          expiresAt: null,
          moderatedBy: user.id,
          createdAt: new Date(),
        });
      }

      // Mark tip as dismissed
      await db.update(tips).set({ status: "dismissed" }).where(eq(tips.id, body.id));

      return NextResponse.json({
        success: true,
        message: mutedUser
          ? `Submitter @${mutedUser.robloxUsername} permanently muted and tip dismissed.`
          : `Tip dismissed (submitted anonymously with no registered user account).`,
        mutedUser: mutedUser ? { id: mutedUser.id, username: mutedUser.robloxUsername } : null,
      });
    }

    // 3. Regular Status Update
    if (!body.id || !body.status) {
      return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
    }

    const VALID_STATUSES = ["unread", "investigating", "dismissed", "published"];
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid tip status specified." }, { status: 400 });
    }

    await db.update(tips).set({ status: body.status as any }).where(eq(tips.id, body.id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update tip status" }, { status: 500 });
  }
}
