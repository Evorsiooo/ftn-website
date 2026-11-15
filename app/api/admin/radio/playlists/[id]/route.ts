import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { radioPlaylists, radioPlaylistSongs, radioSongs } from "@/db/schema";
import { failure, radioAdmin } from "@/lib/radio/admin-route";

export const runtime = "edge";

type Params = { params: Promise<{ id: string }> };

// A playlist and its songs in order.
export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const [playlist] = await ctx.db.select().from(radioPlaylists).where(eq(radioPlaylists.id, id));
  if (!playlist) return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  const songs = await ctx.db
    .select({ id: radioSongs.id, title: radioSongs.title, artist: radioSongs.artist, durationSec: radioSongs.durationSec, thumbnail: radioSongs.thumbnailUrl, archived: radioSongs.archived, key: radioSongs.r2Key })
    .from(radioPlaylistSongs)
    .innerJoin(radioSongs, eq(radioSongs.id, radioPlaylistSongs.songId))
    .where(eq(radioPlaylistSongs.playlistId, id))
    .orderBy(asc(radioPlaylistSongs.position));
  return NextResponse.json({ playlist, songs });
}

// Rename, and/or replace the song list ({ songIds } in order).
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: unknown; description?: unknown; songIds?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  try {
    const [playlist] = await ctx.db.select().from(radioPlaylists).where(eq(radioPlaylists.id, id));
    if (!playlist) return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    const set: Partial<typeof radioPlaylists.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 200) return NextResponse.json({ error: "A name is required (200 characters at most)." }, { status: 400 });
      set.name = name;
    }
    if (body.description !== undefined) {
      set.description = typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 1000) : null;
    }
    if (body.songIds !== undefined) {
      if (!Array.isArray(body.songIds) || body.songIds.length > 2000 || !body.songIds.every((s) => typeof s === "string")) {
        return NextResponse.json({ error: "songIds must be a list of song ids" }, { status: 400 });
      }
      const ids = [...new Set(body.songIds as string[])];
      const found = new Set<string>();
      for (let i = 0; i < ids.length; i += 90) {
        const rows = await ctx.db.select({ id: radioSongs.id }).from(radioSongs).where(inArray(radioSongs.id, ids.slice(i, i + 90)));
        rows.forEach((r) => found.add(r.id));
      }
      const wanted = ids.filter((s) => found.has(s));
      // write only what changed: removed songs, and songs whose position moved
      const current = await ctx.db.select().from(radioPlaylistSongs).where(eq(radioPlaylistSongs.playlistId, id));
      const at = new Map(current.map((c) => [c.songId, c.position]));
      const removed = current.filter((c) => !wanted.includes(c.songId)).map((c) => c.songId);
      const stmts = [];
      for (let i = 0; i < removed.length; i += 90) {
        stmts.push(ctx.db.delete(radioPlaylistSongs).where(and(eq(radioPlaylistSongs.playlistId, id), inArray(radioPlaylistSongs.songId, removed.slice(i, i + 90)))));
      }
      wanted.forEach((songId, position) => {
        if (at.get(songId) === position) return;
        stmts.push(
          ctx.db
            .insert(radioPlaylistSongs)
            .values({ playlistId: id, songId, position })
            .onConflictDoUpdate({ target: [radioPlaylistSongs.playlistId, radioPlaylistSongs.songId], set: { position } })
        );
      });
      for (const s of stmts) await s;
    }
    const [updated] = await ctx.db.update(radioPlaylists).set(set).where(eq(radioPlaylists.id, id)).returning();
    return NextResponse.json({ playlist: updated });
  } catch (err) {
    return failure(err, "Could not save the playlist");
  }
}

// Deletes the playlist only; its songs stay in the library.
export async function DELETE(request: NextRequest, { params }: Params) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  try {
    await ctx.db.delete(radioPlaylists).where(eq(radioPlaylists.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failure(err, "Could not delete the playlist");
  }
}
