import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { mediaBucket } from "@/lib/og/cards";
import { allCards } from "@/lib/og/sources";
import { isCronRequest } from "@/lib/og/auth";

export const runtime = "edge";

// For the link preview workflow (.github/workflows/og-cards.yml): the cards that are not drawn yet,
// with everything the drawing needs. See lib/og/cards.ts.
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const d1 = (process.env as any).DB as D1Database;
  const bucket = mediaBucket();
  if (!d1 || !bucket) return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });

  const cards = await allCards(getDb(d1));
  const have = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const list = await bucket.list({ prefix: "og/", cursor, limit: 1000 });
    for (const o of list.objects) have.add(o.key);
    if (!list.truncated) break;
    cursor = list.cursor;
  }
  const seen = new Set<string>();
  const missing = cards.filter((c) => {
    if (seen.has(c.key) || have.has(`og/${c.key}.jpg`)) return false;
    seen.add(c.key);
    return true;
  });
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 40));
  return NextResponse.json(
    { total: cards.length, missing: missing.length, cards: missing.slice(0, limit) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
