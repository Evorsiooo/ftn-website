import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { adCampaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
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
          await db
            .update(adCampaigns)
            .set({ clicksCount: (ad[0].clicksCount || 0) + 1 })
            .where(eq(adCampaigns.id, id));
        }

        // Validate target URL against open redirect vulnerabilities
        const target = ad[0].targetUrl;
        if (target && (target.startsWith("http://") || target.startsWith("https://") || target.startsWith("/"))) {
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
