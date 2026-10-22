import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { EMPTY_PLUS_NOW, loadPlusNow } from "@/lib/plus-now";

export const runtime = "edge";

// Public: a small summary of what is on FTN+ right now (live streams, radio, next broadcast,
// sports), used by the main site's navbar, homepage and article promos. Cached at the edge.
export async function GET() {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json(EMPTY_PLUS_NOW);
    const data = await loadPlusNow(getDb(d1));
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (err) {
    console.error("Failed to load plus-now:", err);
    return NextResponse.json(EMPTY_PLUS_NOW);
  }
}
