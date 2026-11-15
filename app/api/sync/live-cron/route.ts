import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { syncConfiguredTwitchLives } from "@/lib/twitch";
import { syncAllConfiguredChannels } from "@/lib/youtube";
import { syncOpenImports } from "@/lib/radio/library";

export const runtime = "edge";

// Called every minute by the Cloudflare cron Worker (workers/post-scheduler), so live streams and
// new videos show up without anyone having to load a page first. Twitch and radio library imports
// are checked on every call; YouTube only when ?youtube=1 is passed (the Worker does this every
// 5 minutes) and, as always, no more often than the sync's own cooldown.
export async function POST(request: NextRequest) {
  const accepted = [process.env.SCHEDULE_CRON_SECRET, process.env.RADIO_CRON_SECRET].filter(Boolean);
  const provided = request.headers.get("x-cron-secret");
  if (!provided || !accepted.includes(provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const db = getDb(d1);

  const out: Record<string, unknown> = {};
  try {
    out.twitch = await syncConfiguredTwitchLives(db);
  } catch (err: any) {
    out.twitchError = err?.message || "Twitch sync failed";
  }
  if (request.nextUrl.searchParams.get("youtube") === "1") {
    try {
      const yt = await syncAllConfiguredChannels(db, { cooldownMs: 4 * 60 * 1000 });
      out.youtube = { synced: yt.synced, message: yt.message };
    } catch (err: any) {
      out.youtubeError = err?.message || "YouTube sync failed";
    }
  }
  // Radio library imports that nobody is watching on the Library page: one cheap query when
  // there are none, otherwise one downloader request per unfinished import.
  try {
    const imports = await syncOpenImports(db);
    if (imports.checked) out.radioImports = imports;
  } catch (err: any) {
    out.radioImportsError = err?.message || "Radio import sync failed";
  }
  return NextResponse.json(out);
}
