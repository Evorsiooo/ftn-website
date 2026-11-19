import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { adCampaigns } from "@/db/schema";
import { eq, and, lte, gte, or, isNull, sql } from "drizzle-orm";
import { utcDay } from "@/lib/stats/collect";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const zone = searchParams.get("zone") || "homepage_top";
    const format = searchParams.get("format") || "1024x180"; // "1024x180" | "512x180"

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ ad: null });
    }

    const db = getDb(d1);
    const now = new Date();

    const zoneMapping: Record<string, "header_leaderboard" | "sidebar_rectangle" | "in_feed_banner"> = {
      homepage_top: "header_leaderboard",
      header_leaderboard: "header_leaderboard",
      articles_inline: "in_feed_banner",
      in_feed_banner: "in_feed_banner",
      sports_sidebar: "sidebar_rectangle",
      sidebar_rectangle: "sidebar_rectangle",
    };
    const targetZone = zoneMapping[zone] || (zone as any);

    const activeAds = await db
      .select()
      .from(adCampaigns)
      .where(
        and(
          eq(adCampaigns.zone, targetZone),
          eq(adCampaigns.status, "active"),
          lte(adCampaigns.startDate, now),
          gte(adCampaigns.endDate, now),
          // Show an ad only while it has post impressions left (null = unlimited).
          or(
            isNull(adCampaigns.postImpressionsPurchased),
            sql`${adCampaigns.postImpressionsUsed} < ${adCampaigns.postImpressionsPurchased}`
          )
        )
      );

    if (activeAds.length === 0) {
      return NextResponse.json({ ad: null });
    }

    // Pick random active ad for rotation
    const chosen = activeAds[Math.floor(Math.random() * activeAds.length)];

    // Atomic increments (all-time total, and today's row for the Stats page) in one round trip.
    await d1.batch([
      d1.prepare("UPDATE ad_campaigns SET impressions_count = impressions_count + 1 WHERE id = ?").bind(chosen.id),
      d1
        .prepare("INSERT INTO stat_ad_days (day, ad_id, impressions) VALUES (?, ?, 1) ON CONFLICT(day, ad_id) DO UPDATE SET impressions = impressions + 1")
        .bind(utcDay(), chosen.id),
    ]);

    return NextResponse.json({
      ad: {
        id: chosen.id,
        title: chosen.name,
        imageUrl: chosen.imageUrl,
        targetUrl: chosen.targetUrl,
        zone: chosen.zone,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch ad" }, { status: 500 });
  }
}
