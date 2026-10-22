import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sportsDrivers, sportsEvents, sportsLeagues, sportsTeams } from "@/db/schema";
import { verifySessionToken } from "@/lib/auth";
import { canManageSports } from "@/lib/rbac";
import { slugify } from "@/lib/utils";
import { defaultRules, parseRaceResults, parseRules, type LeagueKind } from "@/lib/sports";

export const runtime = "edge";

type Entity = "leagues" | "teams" | "drivers" | "events";
const TABLES = {
  leagues: sportsLeagues,
  teams: sportsTeams,
  drivers: sportsDrivers,
  events: sportsEvents,
} as const;

type Body = Record<string, unknown>;

const str = (v: unknown, max: number): string | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") throw new Error("Expected text");
  const t = v.trim();
  if (t.length > max) throw new Error(`Text exceeds ${max} characters`);
  return t || null;
};
const int = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error("Expected a whole number");
  return n;
};
const color = (v: unknown) => {
  const c = str(v, 9);
  if (c && !/^#[0-9a-fA-F]{6}$/.test(c)) throw new Error("Colour must look like #FFBB14");
  return c;
};
const required = <T,>(v: T | null | undefined, label: string): T => {
  if (v === null || v === undefined) throw new Error(`${label} is required`);
  return v;
};
const strip = <T extends Body>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

async function authorise(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "") || request.cookies.get("ftn_session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await verifySessionToken(token);
  if (!user || !canManageSports(user.roles)) {
    return NextResponse.json({ error: "Forbidden: Sports Division role required" }, { status: 403 });
  }
  return null;
}

// Turns a request body into column values. On create (`partial` false) required
// fields are enforced; on update only the fields that were sent are touched.
async function buildValues(entity: Entity, body: Body, partial: boolean, db: ReturnType<typeof getDb>) {
  switch (entity) {
    case "leagues": {
      const kind = body.kind as LeagueKind | undefined;
      if (kind !== undefined && kind !== "racing" && kind !== "team") throw new Error("Invalid league type");
      const name = str(body.name, 100);
      let rulesJson: string | undefined;
      if (body.rules !== undefined) {
        if (!kind && partial) throw new Error("kind is required to update rules");
        rulesJson = JSON.stringify(parseRules((kind || "team") as LeagueKind, JSON.stringify(body.rules)));
      } else if (!partial) {
        rulesJson = JSON.stringify(defaultRules(required(kind, "Type")));
      }
      return strip({
        name: partial ? name : required(name, "Name"),
        slug: partial ? undefined : slugify(required(name, "Name")),
        kind: partial ? undefined : required(kind, "Type"),
        sport: partial ? str(body.sport, 50) : required(str(body.sport, 50), "Sport"),
        season: partial ? str(body.season, 30) : required(str(body.season, 30), "Season"),
        color: color(body.color),
        logoUrl: str(body.logoUrl, 500),
        rulesJson,
      });
    }
    case "teams":
      return strip({
        leagueId: partial ? undefined : required(str(body.leagueId, 64), "League"),
        name: partial ? str(body.name, 100) : required(str(body.name, 100), "Name"),
        shortName: str(body.shortName, 10),
        color: color(body.color),
        logoUrl: str(body.logoUrl, 500),
      });
    case "drivers":
      return strip({
        leagueId: partial ? undefined : required(str(body.leagueId, 64), "League"),
        teamId: str(body.teamId, 64),
        name: partial ? str(body.name, 100) : required(str(body.name, 100), "Name"),
        number: int(body.number),
      });
    case "events": {
      const status = body.status as string | undefined;
      if (status !== undefined && !["scheduled", "final", "postponed", "cancelled"].includes(status)) {
        throw new Error("Invalid status");
      }
      let startsAt: Date | undefined;
      if (body.startsAt !== undefined) {
        startsAt = new Date(body.startsAt as string);
        if (isNaN(startsAt.getTime())) throw new Error("Invalid start time");
      } else if (!partial) throw new Error("Start time is required");
      let resultsJson: string | null | undefined;
      if (body.results !== undefined) {
        resultsJson = body.results === null ? null : JSON.stringify(parseRaceResults(JSON.stringify(body.results)));
        if (resultsJson && resultsJson.length > 20000) throw new Error("Results are too large");
      }
      const home = str(body.homeTeamId, 64);
      const away = str(body.awayTeamId, 64);
      if (home && away && home === away) throw new Error("Home and away team must differ");
      return strip({
        leagueId: partial ? undefined : required(str(body.leagueId, 64), "League"),
        name: str(body.name, 150),
        round: int(body.round),
        venue: str(body.venue, 150),
        startsAt,
        status,
        homeTeamId: home,
        awayTeamId: away,
        homeScore: int(body.homeScore),
        awayScore: int(body.awayScore),
        overtime: body.overtime === undefined ? undefined : !!body.overtime,
        resultsJson,
        videoUrl: str(body.videoUrl, 500),
        updatedAt: new Date(),
      });
    }
  }
}

function resolve(params: { entity: string }): Entity | null {
  return params.entity in TABLES ? (params.entity as Entity) : null;
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const entity = resolve(await ctx.params);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const denied = await authorise(request);
  if (denied) return denied;
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);
    const body = (await request.json().catch(() => ({}))) as Body;
    const values = await buildValues(entity, body, false, db);
    const row = { id: crypto.randomUUID(), ...values } as any;
    await db.insert(TABLES[entity] as any).values(row);
    return NextResponse.json({ item: row }, { status: 201 });
  } catch (error: any) {
    const msg = String(error.message || "");
    if (msg.includes("UNIQUE")) return NextResponse.json({ error: "A league with that name already exists" }, { status: 409 });
    return NextResponse.json({ error: msg || "Failed to save" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const entity = resolve(await ctx.params);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const denied = await authorise(request);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const db = getDb(d1);
    const body = (await request.json().catch(() => ({}))) as Body;
    const values = await buildValues(entity, body, true, db);
    if (Object.keys(values).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    const table = TABLES[entity] as any;
    await db.update(table).set(values).where(eq(table.id, id));
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const entity = resolve(await ctx.params);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const denied = await authorise(request);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    const table = TABLES[entity] as any;
    await getDb(d1).delete(table).where(eq(table.id, id));
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete" }, { status: 500 });
  }
}
