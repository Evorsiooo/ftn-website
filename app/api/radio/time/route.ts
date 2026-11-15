import { NextRequest, NextResponse } from "next/server";
import { radioDb } from "@/lib/radio/store";

export const runtime = "edge";

/** A listener counts as on air if their player has checked in within this long (it checks in about every 5 minutes). */
const ON_AIR_SEC = 11 * 60;
/** One database write per listener at most this often (the free tier allows 100,000 writes a day). */
const WRITE_EVERY_SEC = 9 * 60;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Notes that this listener is on, and returns how many are. Uses the
 * radio_listeners table (seen_at in seconds). Null if that fails.
 */
async function countListeners(db: D1Database, id: string): Promise<number | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const seen = await db.prepare("SELECT seen_at FROM radio_listeners WHERE id = ?").bind(id).first<{ seen_at: number }>();
    if (!seen || now - seen.seen_at >= WRITE_EVERY_SEC) {
      await db.prepare("INSERT INTO radio_listeners (id, seen_at) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET seen_at = excluded.seen_at").bind(id, now).run();
      // now and then, forget listeners gone for a day
      if (Math.random() < 0.02) await db.prepare("DELETE FROM radio_listeners WHERE seen_at < ?").bind(now - 86_400).run();
    }
    const row = await db.prepare("SELECT COUNT(*) AS n FROM radio_listeners WHERE seen_at > ?").bind(now - ON_AIR_SEC).first<{ n: number }>();
    return row?.n ?? null;
  } catch {
    return null;
  }
}

/**
 * The radio's clock (plans/radio/timeline.md). Each listener pings this the
 * way BitChord's Listen Together pings its party server: it notes when it
 * asked and when the answer came back, and takes the server time from the
 * quickest round trip. A listener's ping also carries its random id (l), so
 * the answer includes how many people are listening. Never cached.
 */
export async function GET(request: NextRequest) {
  // the time is read first, so the database calls below don't skew the clock
  const serverMs = Date.now();
  const clientMs = Number(request.nextUrl.searchParams.get("c"));
  const id = request.nextUrl.searchParams.get("l");
  const db = radioDb();
  const listeners = id && ID.test(id) && db ? await countListeners(db, id) : null;
  return NextResponse.json(
    { clientMs: Number.isFinite(clientMs) ? clientMs : null, serverMs, listeners },
    { headers: { "Cache-Control": "no-store" } }
  );
}
