import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { dispatchDuePosts } from "@/lib/discord-posts";

export const runtime = "edge";

// Called every few minutes by the scheduled GitHub workflow. Sends every scheduled post whose
// time has come to #ftn-plus and #leadership, where it then waits for approval as usual.
// Secrets: see the check below.
export async function POST(request: NextRequest) {
  // Called by the Cloudflare cron Worker (SCHEDULE_CRON_SECRET) and the GitHub workflow (RADIO_CRON_SECRET).
  const accepted = [process.env.SCHEDULE_CRON_SECRET, process.env.RADIO_CRON_SECRET].filter(Boolean);
  const provided = request.headers.get("x-cron-secret");
  if (!provided || !accepted.includes(provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const db = getDb(d1);

  const results = await dispatchDuePosts(db);
  return NextResponse.json({ sent: results.filter((r) => r.ok).length, results });
}
