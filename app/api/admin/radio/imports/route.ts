import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { radioImports, radioPlaylists } from "@/db/schema";
import { failure, radioAdmin } from "@/lib/radio/admin-route";
import { linkKind, parseReview, startJob, syncOpenImports } from "@/lib/radio/library";
import { albumAudioSummary } from "@/lib/radio/album-audio";

export const runtime = "edge";

// Recent imports (unfinished ones brought up to date with the downloader first), and every
// Spotify track still waiting for someone to pick a match.
export async function GET(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  try {
    const { errors } = await syncOpenImports(ctx.db);
    // the latest 30 imports, and separately the ones with songs waiting for a pick (a partial index
    // holds only those), instead of reading the last 200 imports on every poll
    const select = { imp: radioImports, playlistName: radioPlaylists.name };
    const [rows, waiting] = await Promise.all([
      ctx.db.select(select).from(radioImports).leftJoin(radioPlaylists, eq(radioPlaylists.id, radioImports.playlistId)).orderBy(desc(radioImports.createdAt)).limit(30),
      ctx.db.select(select).from(radioImports).leftJoin(radioPlaylists, eq(radioPlaylists.id, radioImports.playlistId)).where(sql`review LIKE '%"open":[{%'`),
    ]);
    const shape = ({ imp, playlistName }: (typeof rows)[number]) => {
      const { recordedItems: _omit, ...rest } = imp;
      const review = parseReview(imp.review);
      return { ...rest, review: review.open, sourceTotal: review.sourceTotal ?? null, playlistName };
    };
    const imports = rows.map(shape);
    const withReviews = [...waiting.map(shape)].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    // Only on request: the import poll (every 10 s) doesn't need it.
    const albumAudio = request.nextUrl.searchParams.get("audio") === "1" ? await albumAudioSummary(ctx.db).catch(() => null) : undefined;
    return NextResponse.json({ imports, reviews: withReviews.flatMap((i) => i.review.map((r) => ({ importId: i.id, playlistName: i.playlistName, ...r }))), syncErrors: errors, albumAudio });
  } catch (err) {
    return failure(err, "Could not load imports");
  }
}

// Paste a link: a song, or a playlist / album / set, which also becomes a linked library playlist.
export async function POST(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const kind = url.length <= 2000 ? linkKind(url) : null;
  if (!kind) return NextResponse.json({ error: "Paste a YouTube, YouTube Music, SoundCloud or Spotify link." }, { status: 400 });
  if (kind.mix) {
    return NextResponse.json(
      { error: "That's a YouTube Mix, which YouTube keeps generating without end, so it can't be imported. Open the song itself, or a saved playlist." },
      { status: 400 }
    );
  }
  try {
    const { jobId, job } = await startJob(ctx.db, url, null);
    const now = new Date();
    let playlistId: string | null = null;
    if (kind.collection) {
      playlistId = crypto.randomUUID();
      // named after the link until the downloader reports the playlist's own name
      await ctx.db.insert(radioPlaylists).values({ id: playlistId, name: url, sourceUrl: url, source: kind.source, createdBy: ctx.user.id, createdAt: now, updatedAt: now });
    }
    const [row] = await ctx.db
      .insert(radioImports)
      .values({ id: jobId, url, playlistId, state: job.state, title: job.title, total: job.total, createdBy: ctx.user.id, createdAt: now, updatedAt: now })
      .returning();
    return NextResponse.json({ import: { ...row, review: [] } }, { status: 201 });
  } catch (err) {
    return failure(err, "Could not start the import");
  }
}
