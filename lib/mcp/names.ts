import { eq } from "drizzle-orm";
import type { DbClient } from "@/db";
import {
  adCampaigns,
  articles,
  broadcasts,
  organizers,
  posts,
  radioImports,
  radioPlaylists,
  radioReplays,
  radioShows,
  radioSongs,
  sportsDrivers,
  sportsEvents,
  sportsLeagues,
  sportsTeams,
  sportsVenues,
  users,
} from "@/db/schema";

/** What an id in a tool's arguments points to, so approvals read "Delete playlist "Chill mix"", not an id. */
export type RefKind =
  | "article"
  | "post"
  | "playlist"
  | "song"
  | "ad"
  | "organization"
  | "show"
  | "broadcast"
  | "replay"
  | "import"
  | "user"
  | "sports";

/** The readable name of one item, or null when it can't be found. */
export async function nameOf(db: DbClient, kind: RefKind, id: string, args: Record<string, unknown> = {}): Promise<string | null> {
  try {
    switch (kind) {
      case "article":
        return (await db.select({ n: articles.title }).from(articles).where(eq(articles.slug, id)).limit(1))[0]?.n ?? null;
      case "post":
        return (await db.select({ n: posts.headline }).from(posts).where(eq(posts.id, id)).limit(1))[0]?.n ?? null;
      case "playlist":
        return (await db.select({ n: radioPlaylists.name }).from(radioPlaylists).where(eq(radioPlaylists.id, id)).limit(1))[0]?.n ?? null;
      case "song": {
        const s = (await db.select({ t: radioSongs.title, a: radioSongs.artist }).from(radioSongs).where(eq(radioSongs.id, id)).limit(1))[0];
        return s ? `${s.t}${s.a ? ` by ${s.a}` : ""}` : null;
      }
      case "ad":
        return (await db.select({ n: adCampaigns.name }).from(adCampaigns).where(eq(adCampaigns.id, id)).limit(1))[0]?.n ?? null;
      case "organization":
        return (await db.select({ n: organizers.name }).from(organizers).where(eq(organizers.id, id)).limit(1))[0]?.n ?? null;
      case "show":
        return (await db.select({ n: radioShows.name }).from(radioShows).where(eq(radioShows.id, id)).limit(1))[0]?.n ?? null;
      case "broadcast": {
        const b = (await db.select({ t: broadcasts.title, s: radioShows.name }).from(broadcasts).leftJoin(radioShows, eq(radioShows.id, broadcasts.showId)).where(eq(broadcasts.id, id)).limit(1))[0];
        return b ? b.t || b.s : null;
      }
      case "replay":
        return (await db.select({ n: radioReplays.title }).from(radioReplays).where(eq(radioReplays.id, id)).limit(1))[0]?.n ?? null;
      case "import":
        return (await db.select({ n: radioImports.title }).from(radioImports).where(eq(radioImports.id, id)).limit(1))[0]?.n ?? null;
      case "user":
        return (await db.select({ n: users.robloxUsername }).from(users).where(eq(users.id, id)).limit(1))[0]?.n ?? null;
      case "sports": {
        const table = { leagues: sportsLeagues, teams: sportsTeams, drivers: sportsDrivers, venues: sportsVenues, events: sportsEvents }[String(args.type)];
        if (!table) return null;
        return (await db.select({ n: table.name }).from(table).where(eq(table.id, id)).limit(1))[0]?.n ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Replaces the ids in a summary with the items' names, and starts it with a capital. */
export async function readableSummary(db: DbClient, summary: string, refs: Record<string, RefKind> | undefined, args: Record<string, unknown>): Promise<string> {
  let out = summary;
  for (const [key, kind] of Object.entries(refs || {})) {
    const values = Array.isArray(args[key]) ? (args[key] as unknown[]) : [args[key]];
    for (const v of values) {
      if (typeof v !== "string" || !v) continue;
      const name = await nameOf(db, kind, v, args);
      if (name) out = out.split(v).join(`"${name}"`);
    }
    // a list of ids: name the first few
    if (Array.isArray(args[key]) && (args[key] as unknown[]).length > 0) {
      const names: string[] = [];
      for (const v of (args[key] as unknown[]).slice(0, 5)) if (typeof v === "string") names.push((await nameOf(db, kind, v, args)) || v);
      out += `: ${names.map((n) => `"${n}"`).join(", ")}${(args[key] as unknown[]).length > 5 ? "…" : ""}`;
    }
  }
  return out.charAt(0).toUpperCase() + out.slice(1);
}
