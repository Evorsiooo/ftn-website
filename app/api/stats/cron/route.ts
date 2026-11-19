import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { snapshot } from "@/lib/stats/collect";

export const runtime = "edge";

// Called every 5 minutes by the cron Worker (workers/post-scheduler): saves the radio's listener count
// and the songs that started, for the admin Stats page.
export async function POST(request: NextRequest) {
  const secret = process.env.SCHEDULE_CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  if (!secret || !provided || !safeEqual(provided, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = (process.env as any).DB as D1Database | undefined;
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  try {
    return NextResponse.json(await snapshot(db));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}
