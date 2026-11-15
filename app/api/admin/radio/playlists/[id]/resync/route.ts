import { NextRequest, NextResponse } from "next/server";
import { and, eq, notInArray } from "drizzle-orm";
import { radioImports, radioPlaylists } from "@/db/schema";
import { failure, radioAdmin } from "@/lib/radio/admin-route";
import { FINAL_STATES, startJob } from "@/lib/radio/library";

export const runtime = "edge";

// Imports a linked playlist's source again: songs added there since are downloaded and added,
// and the order follows the source. Songs already in R2 aren't downloaded twice.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  try {
    const [playlist] = await ctx.db.select().from(radioPlaylists).where(eq(radioPlaylists.id, id));
    if (!playlist) return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    if (!playlist.sourceUrl) return NextResponse.json({ error: "This playlist isn't linked to a source." }, { status: 400 });
    const [running] = await ctx.db
      .select({ id: radioImports.id })
      .from(radioImports)
      .where(and(eq(radioImports.playlistId, id), notInArray(radioImports.state, FINAL_STATES)));
    if (running) return NextResponse.json({ error: "This playlist is already being imported." }, { status: 409 });
    const { jobId, job } = await startJob(ctx.db, playlist.sourceUrl, null);
    const now = new Date();
    const [row] = await ctx.db
      .insert(radioImports)
      .values({ id: jobId, url: playlist.sourceUrl, playlistId: id, state: job.state, title: job.title ?? playlist.name, total: job.total, createdBy: ctx.user.id, createdAt: now, updatedAt: now })
      .returning();
    return NextResponse.json({ import: row }, { status: 201 });
  } catch (err) {
    return failure(err, "Could not re-sync the playlist");
  }
}
