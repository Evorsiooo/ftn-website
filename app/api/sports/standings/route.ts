import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { calculateLeagueStandings } from "@/lib/sports";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get("leagueId");
    if (!leagueId) {
      return NextResponse.json({ error: "leagueId required" }, { status: 400 });
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ standings: [] });
    }

    const db = getDb(d1);
    const standings = await calculateLeagueStandings(db, leagueId);
    return NextResponse.json({ standings }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to calculate standings" }, { status: 500 });
  }
}
