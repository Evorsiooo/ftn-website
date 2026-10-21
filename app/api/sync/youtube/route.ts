import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { syncAllConfiguredChannels } from "@/lib/youtube";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json(
        { error: "Database unavailable (Cloudflare D1 required for sync)" },
        { status: 500 }
      );
    }
    const db = getDb(d1);

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;

    // Check if valid session or cron token
    if (token) {
      const { verifySessionToken } = await import("@/lib/auth");
      const user = await verifySessionToken(token);
      if (!user || (!user.roles.includes("site_admin") && !user.roles.includes("manager"))) {
        return NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "Unauthorized: Admin session required" }, { status: 401 });
    }

    const body = ((await request.json().catch(() => ({}))) || {}) as {
      channelId?: string;
      channelIds?: string[];
    };

    const channels: string[] = [];
    if (body.channelId && body.channelId.trim()) channels.push(body.channelId.trim());
    if (Array.isArray(body.channelIds)) {
      body.channelIds.forEach((c) => {
        if (c && typeof c === "string" && c.trim() && !channels.includes(c.trim())) {
          channels.push(c.trim());
        }
      });
    }

    const result = await syncAllConfiguredChannels(db, {
      force: true,
      channelIds: channels.length > 0 ? channels : undefined,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Sync failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json(
        { error: "Database unavailable (Cloudflare D1 required for sync)" },
        { status: 500 }
      );
    }
    const db = getDb(d1);

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    const cronSecret = (process.env.CRON_SECRET || "").trim();
    const providedCron = request.headers.get("x-cron-secret") || authHeader?.replace("Bearer ", "");

    let forceSync = false;

    if (cronSecret && providedCron === cronSecret) {
      forceSync = true;
    } else if (token) {
      const { verifySessionToken } = await import("@/lib/auth");
      const user = await verifySessionToken(token);
      if (user && (user.roles.includes("site_admin") || user.roles.includes("manager"))) {
        forceSync = true;
      }
    }

    // If authenticated admin or valid cron secret: bypass cooldown.
    // If public trigger (external cron, GitHub Actions, uptime ping): enforce 60s cooldown to prevent API exhaustion.
    const result = await syncAllConfiguredChannels(db, {
      force: forceSync,
      cooldownMs: 60 * 1000,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Sync failed" }, { status: 500 });
  }
}
