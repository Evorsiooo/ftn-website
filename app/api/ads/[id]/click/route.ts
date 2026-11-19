import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { adCampaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { utcDay } from "@/lib/stats/collect";
import { isSafeUrl } from "@/lib/admin-auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientIp = getClientIp(request);

    // Rate limit click tracking (Max 5 clicks per 60s per IP for same ad)
    const rateLimit = await checkRateLimit(`ad_click:${clientIp}:${id}`, 5, 60);

    const d1 = (process.env as any).DB as D1Database;
    if (d1) {
      const db = getDb(d1);
      const ad = await db.select().from(adCampaigns).where(eq(adCampaigns.id, id)).limit(1);
      if (ad.length > 0) {
        if (rateLimit.allowed) {
          // all-time total and today's row (Stats page) in one round trip
          await d1.batch([
            d1.prepare("UPDATE ad_campaigns SET clicks_count = clicks_count + 1 WHERE id = ?").bind(id),
            d1.prepare("INSERT INTO stat_ad_days (day, ad_id, clicks) VALUES (?, ?, 1) ON CONFLICT(day, ad_id) DO UPDATE SET clicks = clicks + 1").bind(utcDay(), id),
          ]);
        }

        // Validate target URL against open redirect vulnerabilities
        const target = ad[0].targetUrl;
        if (target && isSafeUrl(target)) {
          return NextResponse.redirect(new URL(target, request.url), 307);
        }
      }
    }

    return NextResponse.redirect(new URL("/", request.url), 307);
  } catch (error) {
    console.error("Ad redirect error:", error);
    return NextResponse.redirect(new URL("/", request.url), 307);
  }
}
