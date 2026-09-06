import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { adCampaigns } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { canManageAds } from "@/lib/rbac";
import { desc } from "drizzle-orm";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || !canManageAds(user.roles)) {
      return NextResponse.json({ error: "Forbidden: Commercial Division role required" }, { status: 403 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ campaigns: [] });
    }

    const db = getDb(d1);
    const campaigns = await db.select().from(adCampaigns).orderBy(desc(adCampaigns.createdAt));
    return NextResponse.json({ campaigns });
  } catch (error: any) {
    console.error("Load ad campaigns error:", error);
    return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || !canManageAds(user.roles)) {
      return NextResponse.json({ error: "Forbidden: Commercial Division role required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      advertiserName?: string;
      imageUrl?: string;
      targetUrl?: string;
      format?: "1024x180" | "512x180";
      zone?: string;
      startDate?: string;
      endDate?: string;
    };

    const title = body.title?.trim();
    const advertiserName = (body.advertiserName?.trim() || "Official Sponsor").slice(0, 100);
    const imageUrl = body.imageUrl?.trim();
    const targetUrl = body.targetUrl?.trim();
    const format = body.format;

    if (!title || !imageUrl || !targetUrl || !format) {
      return NextResponse.json({ error: "Missing required ad campaign fields" }, { status: 400 });
    }

    if (title.length > 150) {
      return NextResponse.json({ error: "Ad title exceeds maximum length of 150 characters" }, { status: 400 });
    }

    if (imageUrl.length > 2048 || targetUrl.length > 2048) {
      return NextResponse.json({ error: "URLs exceed maximum length of 2048 characters" }, { status: 400 });
    }

    const VALID_FORMATS = ["1024x180", "512x180"];
    if (!VALID_FORMATS.includes(format)) {
      return NextResponse.json({ error: "Invalid ad format. Must be 1024x180 or 512x180." }, { status: 400 });
    }

    // Protocol check against unsafe protocols / XSS (e.g. javascript:, data:)
    if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://") && !imageUrl.startsWith("/")) {
      return NextResponse.json({ error: "Image URL must start with http://, https://, or /" }, { status: 400 });
    }
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://") && !targetUrl.startsWith("/")) {
      return NextResponse.json({ error: "Target URL must start with http://, https://, or /" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const db = getDb(d1);
    const id = crypto.randomUUID();
    const zoneMapping: Record<string, "header_leaderboard" | "sidebar_rectangle" | "in_feed_banner"> = {
      homepage_top: "header_leaderboard",
      articles_inline: "in_feed_banner",
      sports_sidebar: "sidebar_rectangle",
    };

    const targetZone = body.zone ? zoneMapping[body.zone] || "header_leaderboard" : "header_leaderboard";

    const newCampaign = {
      id,
      name: title,
      advertiserName: body.advertiserName?.trim() || "Official Sponsor",
      imageUrl: imageUrl,
      targetUrl: targetUrl,
      zone: targetZone,
      weight: 1,
      status: "active" as const,
      impressionsCount: 0,
      clicksCount: 0,
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      endDate: body.endDate ? new Date(body.endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    };

    await db.insert(adCampaigns).values(newCampaign);
    return NextResponse.json({ campaign: newCampaign }, { status: 201 });
  } catch (error: any) {
    console.error("Create ad campaign error:", error);
    return NextResponse.json({ error: "Failed to create ad campaign" }, { status: 500 });
  }
}
