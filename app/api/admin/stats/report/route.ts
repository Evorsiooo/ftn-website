import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-auth";
import { canManageAds } from "@/lib/rbac";
import { advertiserReport, rangeOf } from "@/lib/stats/queries";

export const runtime = "edge";

/** GET ?org=<organizer id>&days=7|30|90|365: an advertiser's report (Commercial and site admins). */
export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, canManageAds);
  if ("error" in auth) return auth.error;
  const org = request.nextUrl.searchParams.get("org") || "";
  const asked = Number(request.nextUrl.searchParams.get("days"));
  const days = [7, 30, 90, 365].includes(asked) ? asked : 30;
  const db = (process.env as any).DB as D1Database | undefined;
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const report = await advertiserReport(db, org, rangeOf(days));
  if (!report) return NextResponse.json({ error: "Advertiser not found" }, { status: 404 });
  return NextResponse.json({ periodDays: days, ...report }, { headers: { "Cache-Control": "private, no-store" } });
}
