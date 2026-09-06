import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { leagues } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { canManageSports } from "@/lib/rbac";
import { slugify } from "@/lib/utils";

export const runtime = "edge";

export async function GET() {
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ leagues: [] });
    }
    const db = getDb(d1);
    const leagueList = await db.select().from(leagues);
    return NextResponse.json({ leagues: leagueList }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load leagues" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifySessionToken(token);
    if (!user || !canManageSports(user.roles)) {
      return NextResponse.json({ error: "Forbidden: Sports Division role required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      sportType?: "racing" | "match_based";
      season?: string;
      pointSystemJson?: string;
    };

    const name = body.name?.trim();
    const sportType = body.sportType;
    const season = body.season?.trim();
    const pointSystemJson = body.pointSystemJson;

    if (!name || !sportType || !season) {
      return NextResponse.json({ error: "Missing required league fields" }, { status: 400 });
    }

    if (name.length > 100) {
      return NextResponse.json({ error: "League name exceeds maximum length of 100 characters" }, { status: 400 });
    }

    if (season.length > 50) {
      return NextResponse.json({ error: "Season exceeds maximum length of 50 characters" }, { status: 400 });
    }

    if (sportType !== "racing" && sportType !== "match_based") {
      return NextResponse.json({ error: "Invalid sport type. Must be 'racing' or 'match_based'." }, { status: 400 });
    }

    if (pointSystemJson) {
      if (pointSystemJson.length > 1000) {
        return NextResponse.json({ error: "Points system config exceeds maximum size" }, { status: 400 });
      }
      try {
        JSON.parse(pointSystemJson);
      } catch {
        return NextResponse.json({ error: "Invalid JSON format for point system" }, { status: 400 });
      }
    }

    const id = crypto.randomUUID();
    const slug = slugify(name);

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const db = getDb(d1);
    const newLeague = {
      id,
      slug: `${slug}-${id.slice(0, 6)}`,
      name,
      sportType,
      season,
      pointSystemJson: pointSystemJson || JSON.stringify({ win: 3, draw: 1, loss: 0 }),
      createdAt: new Date(),
    };

    await db.insert(leagues).values(newLeague);
    return NextResponse.json({ league: newLeague }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create league" }, { status: 500 });
  }
}
