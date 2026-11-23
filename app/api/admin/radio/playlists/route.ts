import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { radioPlaylists } from "@/db/schema";
import { failure, radioAdmin } from "@/lib/radio/admin-route";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  // song_count is kept by database triggers (migration 0034), so this reads only the playlists. Counting
  // the songs here read every playlist song on each Library load.
  const playlists = await ctx.db
    .select({
      id: radioPlaylists.id,
      name: radioPlaylists.name,
      description: radioPlaylists.description,
      sourceUrl: radioPlaylists.sourceUrl,
      source: radioPlaylists.source,
      lastSyncedAt: radioPlaylists.lastSyncedAt,
      updatedAt: radioPlaylists.updatedAt,
      songs: radioPlaylists.songCount,
    })
    .from(radioPlaylists)
    .orderBy(desc(radioPlaylists.updatedAt));
  return NextResponse.json({ playlists: playlists.map((p) => ({ ...p, songs: Number(p.songs) })) });
}

// A playlist made by hand from library songs.
export async function POST(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) return NextResponse.json({ error: "A name is required (200 characters at most)." }, { status: 400 });
  try {
    const now = new Date();
    const [playlist] = await ctx.db.insert(radioPlaylists).values({ id: crypto.randomUUID(), name, createdBy: ctx.user.id, createdAt: now, updatedAt: now }).returning();
    return NextResponse.json({ playlist }, { status: 201 });
  } catch (err) {
    return failure(err, "Could not create the playlist");
  }
}
