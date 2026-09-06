import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { syncYouTubeChannel } from "@/lib/youtube";
import { siteSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "edge";

async function performSync(channelIds?: string[]) {
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) {
    return {
      success: true,
      synced: 0,
      message: "Database unavailable (Cloudflare D1 required for sync)",
    };
  }

  const db = getDb(d1);
  const targetChannels: string[] = [];

  if (Array.isArray(channelIds)) {
    channelIds.forEach((c) => {
      if (c && c.trim() && !targetChannels.includes(c.trim())) {
        targetChannels.push(c.trim());
      }
    });
  }

  // If no channels passed in request, load configured channels from site_settings
  if (targetChannels.length === 0) {
    const settingsRows = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, "main_config"))
      .limit(1);

    if (settingsRows.length > 0) {
      try {
        const config = JSON.parse(settingsRows[0].valueJson);
        if (Array.isArray(config.youtubeChannels)) {
          config.youtubeChannels.forEach((c: string) => {
            if (c && c.trim() && !targetChannels.includes(c.trim())) {
              targetChannels.push(c.trim());
            }
          });
        }
      } catch {}
    }
  }

  if (targetChannels.length === 0) {
    return {
      success: true,
      synced: 0,
      message: "No YouTube channels are currently configured to sync.",
    };
  }

  let totalSynced = 0;
  const channelResults: Array<{ channel: string; count: number }> = [];

  for (const channel of targetChannels) {
    try {
      const count = await syncYouTubeChannel(db, channel);
      totalSynced += count;
      channelResults.push({ channel, count });
    } catch (err: any) {
      console.warn(`Sync error for ${channel}:`, err);
      channelResults.push({ channel, count: 0 });
    }
  }

  // Update last sync timestamp
  try {
    const strNow = String(Date.now());
    const syncRow = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, "youtube_last_sync"))
      .limit(1);

    if (syncRow.length > 0) {
      await db
        .update(siteSettings)
        .set({ valueJson: strNow, updatedAt: new Date() })
        .where(eq(siteSettings.key, "youtube_last_sync"));
    } else {
      await db.insert(siteSettings).values({
        key: "youtube_last_sync",
        valueJson: strNow,
        updatedAt: new Date(),
      });
    }
  } catch {}

  return {
    success: true,
    synced: totalSynced,
    channels: channelResults,
    message: `Synced ${channelResults.length} channel(s). Total videos updated: ${totalSynced}.`,
  };
}

export async function POST(request: NextRequest) {
  try {
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
    if (Array.isArray(body.channelIds)) channels.push(...body.channelIds);

    const result = await performSync(channels.length > 0 ? channels : undefined);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Sync failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    const cronSecret = (process.env.CRON_SECRET || "").trim();
    const providedCron = request.headers.get("x-cron-secret") || authHeader?.replace("Bearer ", "");

    let authorized = false;

    if (cronSecret && providedCron === cronSecret) {
      authorized = true;
    } else if (token) {
      const { verifySessionToken } = await import("@/lib/auth");
      const user = await verifySessionToken(token);
      if (user && (user.roles.includes("site_admin") || user.roles.includes("manager"))) {
        authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized: Admin session or CRON authorization required" }, { status: 401 });
    }

    const result = await performSync();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Sync failed" }, { status: 500 });
  }
}
