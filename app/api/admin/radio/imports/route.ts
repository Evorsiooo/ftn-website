import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { radioImports, radioPlaylists } from "@/db/schema";
import { failure, radioAdmin } from "@/lib/radio/admin-route";
import { linkKind, parseReview, startJob, syncOpenImports } from "@/lib/radio/library";

export const runtime = "edge";

// Recent imports (unfinished ones brought up to date with the downloader first), and every
// Spotify track still waiting for someone to pick a match.
export async function GET(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  try {
    const { errors } = await syncOpenImports(ctx.db);
    const rows = await ctx.db
      .select({ imp: radioImports, playlistName: radioPlaylists.name })
      .from(radioImports)
      .leftJoin(radioPlaylists, eq(radioPlaylists.id, radioImports.playlistId))
      .orderBy(desc(radioImports.createdAt))
      .limit(200);
    const imports = rows.map(({ imp, playlistName }) => {
      const review = parseReview(imp.review);
      return { ...imp, review: review.open, playlistName };
    });
    return NextResponse.json({ imports: imports.slice(0, 30), reviews: imports.flatMap((i) => i.review.map((r) => ({ importId: i.id, playlistName: i.playlistName, ...r }))), syncErrors: errors });
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
