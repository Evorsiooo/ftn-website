import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { radioSongs } from "@/db/schema";
import { failure, radioAdmin } from "@/lib/radio/admin-route";
import { isLinedUp, radioBucket } from "@/lib/radio/library";
import { isLyricsOffset, isLyricsSource } from "@/lib/radio/lyrics-choice";

export const runtime = "edge";

type Params = { params: Promise<{ id: string }> };

// Edit a song's title, artist, album, year and cover (by hand, or from the music catalog), its lyrics (provider and
// offset, for every listener), its genre tags (from the catalogues, or by hand), or archive it (hidden from the AutoDJ and the library list) and back.
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { title?: unknown; artist?: unknown; album?: unknown; releaseYear?: unknown; thumbnail?: unknown; archived?: unknown; lyricsSource?: unknown; lyricsOffsetMs?: unknown; genre?: unknown; genres?: unknown; originalYear?: unknown; genreChecked?: unknown; genreByHand?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const set: Partial<typeof radioSongs.$inferInsert> = {};
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 300) return NextResponse.json({ error: "A title is required (300 characters at most)." }, { status: 400 });
    set.title = title;
  }
  if (body.artist !== undefined) {
    const artist = typeof body.artist === "string" ? body.artist.trim() : "";
    if (!artist || artist.length > 300) return NextResponse.json({ error: "An artist is required (300 characters at most)." }, { status: 400 });
    set.artist = artist;
  }
  if (body.album !== undefined) {
    if (body.album !== null && (typeof body.album !== "string" || body.album.trim().length > 300)) return NextResponse.json({ error: "album must be text (300 characters at most) or null" }, { status: 400 });
    set.album = typeof body.album === "string" ? body.album.trim() || null : null;
  }
  if (body.releaseYear !== undefined) {
    const y = body.releaseYear;
    if (y !== null && !(typeof y === "number" && Number.isInteger(y) && y >= 1800 && y <= 2200)) return NextResponse.json({ error: "releaseYear must be a year or null" }, { status: 400 });
    set.releaseYear = y as number | null;
  }
  if (body.thumbnail !== undefined) {
    const t = body.thumbnail;
    if (typeof t !== "string" || !/^https:\/\/[^\s"'<>]+$/.test(t) || t.length > 500) return NextResponse.json({ error: "thumbnail must be an https link" }, { status: 400 });
    set.thumbnailUrl = t;
  }
  if (body.lyricsSource !== undefined) {
    if (!isLyricsSource(body.lyricsSource)) return NextResponse.json({ error: "lyricsSource must be a lyrics provider, \"none\" or null" }, { status: 400 });
    set.lyricsSource = body.lyricsSource;
  }
  if (body.lyricsOffsetMs !== undefined) {
    if (!isLyricsOffset(body.lyricsOffsetMs)) return NextResponse.json({ error: "lyricsOffsetMs must be -5000 to 5000, in steps of 100" }, { status: 400 });
    set.lyricsOffsetMs = body.lyricsOffsetMs;
  }
  if (body.genre !== undefined) {
    const g = body.genre;
    if (g !== null && (typeof g !== "string" || g.trim().length > 60)) return NextResponse.json({ error: "genre must be text (60 characters at most) or null" }, { status: 400 });
    set.genre = typeof g === "string" ? g.trim() || null : null;
  }
  if (body.genres !== undefined) {
    const g = body.genres;
    if (g !== null && !(Array.isArray(g) && g.length <= 8 && g.every((x) => typeof x === "string" && x.trim() && x.trim().length <= 60)))
      return NextResponse.json({ error: "genres must be a list of up to 8 names (60 characters each) or null" }, { status: 400 });
    const list = Array.isArray(g) ? [...new Set(g.map((x: string) => x.trim().toLowerCase()))] : [];
    set.genres = list.length ? JSON.stringify(list) : null;
  }
  if (body.originalYear !== undefined) {
    const y = body.originalYear;
    if (y !== null && !(typeof y === "number" && Number.isInteger(y) && y >= 1800 && y <= 2200)) return NextResponse.json({ error: "originalYear must be a year or null" }, { status: 400 });
    set.originalYear = y as number | null;
  }
  if (body.genreChecked !== undefined) {
    if (body.genreChecked !== true) return NextResponse.json({ error: "genreChecked can only be true" }, { status: 400 });
    set.genreCheckedAt = new Date();
  }
  if (body.genreByHand !== undefined) {
    if (typeof body.genreByHand !== "boolean") return NextResponse.json({ error: "genreByHand must be true or false" }, { status: 400 });
    set.genreByHand = body.genreByHand;
  }
  if (body.archived !== undefined) {
    if (typeof body.archived !== "boolean") return NextResponse.json({ error: "archived must be true or false" }, { status: 400 });
    set.archived = body.archived;
  }
  if (!Object.keys(set).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  set.updatedAt = new Date();
  try {
    const [song] = await ctx.db.update(radioSongs).set(set).where(eq(radioSongs.id, id)).returning();
    if (!song) return NextResponse.json({ error: "Song not found" }, { status: 404 });
    return NextResponse.json({ song });
  } catch (err) {
    return failure(err, "Could not update the song");
  }
}

// Delete for real: the library row, its playlist entries, and its files in R2.
export async function DELETE(request: NextRequest, { params }: Params) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const bucket = radioBucket();
  if (!bucket) return NextResponse.json({ error: "Radio storage unavailable" }, { status: 503 });
  try {
    const [song] = await ctx.db.select().from(radioSongs).where(eq(radioSongs.id, id));
    if (!song) return NextResponse.json({ error: "Song not found" }, { status: 404 });
    if (await isLinedUp(bucket, song.r2Key)) {
      return NextResponse.json(
        { error: "This song is playing or lined up on the radio. Archive it now and delete it once it has played." },
        { status: 409 }
      );
    }
    await bucket.delete([song.r2Key, ...(song.metaKey ? [song.metaKey] : [])]);
    await ctx.db.delete(radioSongs).where(eq(radioSongs.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failure(err, "Could not delete the song");
  }
}
