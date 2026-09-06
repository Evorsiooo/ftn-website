import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { fixtures } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { canManageSports } from "@/lib/rbac";
import { eq, and, desc } from "drizzle-orm";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get("leagueId");
    const status = searchParams.get("status");

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ fixtures: [] });
    }

    const db = getDb(d1);
    const conditions = [];

    if (leagueId) conditions.push(eq(fixtures.leagueId, leagueId));
    if (status) conditions.push(eq(fixtures.status, status as any));

    const fixtureList = await db
      .select()
      .from(fixtures)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(fixtures.scheduledAt));

    return NextResponse.json({ fixtures: fixtureList }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load fixtures" }, { status: 500 });
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
      leagueId?: string;
      homeTeamOrDriver?: string;
      awayTeamOrDriver?: string;
      scheduledAt?: string | number;
      status?: "scheduled" | "in_progress" | "completed" | "cancelled";
      resultsJson?: string;
    };

    const leagueId = body.leagueId?.trim();
    const homeTeam = body.homeTeamOrDriver?.trim();
    const awayTeam = body.awayTeamOrDriver?.trim();
    const scheduledAtRaw = body.scheduledAt;
    const status = body.status || "scheduled";
    const resultsJson = body.resultsJson;

    if (!leagueId || !homeTeam || !scheduledAtRaw) {
      return NextResponse.json({ error: "Missing required fixture fields (leagueId, homeTeamOrDriver, scheduledAt)" }, { status: 400 });
    }

    if (homeTeam.length > 100 || (awayTeam && awayTeam.length > 100)) {
      return NextResponse.json({ error: "Team / Driver names exceed maximum length of 100 characters" }, { status: 400 });
    }

    const scheduledAt = new Date(scheduledAtRaw);
    if (isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: "Invalid scheduled date timestamp" }, { status: 400 });
    }

    const VALID_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"];
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid fixture status" }, { status: 400 });
    }

    if (resultsJson) {
      if (resultsJson.length > 2000) {
        return NextResponse.json({ error: "Results JSON exceeds maximum size limit" }, { status: 400 });
      }
      try {
        JSON.parse(resultsJson);
      } catch {
        return NextResponse.json({ error: "Invalid JSON format for results" }, { status: 400 });
      }
    }

    const d1 = (process.env as any).DB as D1Database;
    if (!d1) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const db = getDb(d1);
    const id = crypto.randomUUID();
    const newFixture = {
      id,
      leagueId,
      homeTeamOrDriver: homeTeam,
      awayTeamOrDriver: awayTeam || null,
      scheduledAt,
      status: status as any,
      resultsJson: resultsJson || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(fixtures).values(newFixture);
    return NextResponse.json({ fixture: newFixture }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create fixture" }, { status: 500 });
  }
}
