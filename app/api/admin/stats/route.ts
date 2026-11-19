import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-auth";
import { canManageAds } from "@/lib/rbac";
import { STATS_DAYS, STATS_TABS, canSeeStats } from "@/lib/stats/access";
import { plusStats, postStats, radioStats, rangeOf, siteStats } from "@/lib/stats/queries";
import { webStats } from "@/lib/stats/web-analytics";

export const runtime = "edge";

/** GET ?tab=radio|site|plus|posts&days=1|7|30|90: one tab of the admin Stats page. */
export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, canSeeStats);
  if ("error" in auth) return auth.error;
  const roles = auth.user.roles || [];
  const tab = STATS_TABS.find((t) => t.key === request.nextUrl.searchParams.get("tab"));
  if (!tab) return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
  if (!tab.allowed(roles)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const asked = Number(request.nextUrl.searchParams.get("days"));
  const days = (STATS_DAYS as readonly number[]).includes(asked) ? asked : 30;
  const db = (process.env as any).DB as D1Database | undefined;
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const range = rangeOf(days);
  const headers = { "Cache-Control": "private, no-store" };
  try {
    if (tab.key === "radio") return NextResponse.json({ days, radio: await radioStats(db, range) }, { headers });
    if (tab.key === "site") {
      const [site, web] = await Promise.all([siteStats(db, range), webStats(days)]);
      return NextResponse.json({ days, site, web }, { headers });
    }
    if (tab.key === "plus") return NextResponse.json({ days, plus: await plusStats(db, range) }, { headers });
    return NextResponse.json({ days, posts: await postStats(db, range, canManageAds(roles)) }, { headers });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to load statistics" }, { status: 500 });
  }
}
