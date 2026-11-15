import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { radioImports } from "@/db/schema";
import { failure, radioAdmin } from "@/lib/radio/admin-route";
import { parseReview, startJob } from "@/lib/radio/library";

export const runtime = "edge";

// Answer an unsure Spotify match: { index, url } downloads that candidate (into the same place in
// the playlist), { index, url: null } skips the track.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { index?: unknown; url?: unknown } | null;
  if (!body || typeof body.index !== "number" || (body.url !== null && typeof body.url !== "string")) {
    return NextResponse.json({ error: "Send { index, url } (url null to skip)." }, { status: 400 });
  }
  try {
    const [row] = await ctx.db.select().from(radioImports).where(eq(radioImports.id, id));
    if (!row) return NextResponse.json({ error: "Import not found" }, { status: 404 });
    const review = parseReview(row.review);
    const item = review.open.find((r) => r.index === body.index);
    if (!item) return NextResponse.json({ error: "Already answered" }, { status: 409 });

    let started: { id: string } | null = null;
    if (typeof body.url === "string") {
      // only one of the downloader's own candidates
      if (!item.candidates.some((c) => c.url === body.url)) return NextResponse.json({ error: "Not one of the candidates" }, { status: 400 });
      const { jobId, job } = await startJob(ctx.db, body.url, null);
      const now = new Date();
      await ctx.db.insert(radioImports).values({
        id: jobId,
        url: body.url,
        playlistId: row.playlistId,
        position: row.playlistId ? item.index : null,
        state: job.state,
        title: item.spotify ? `${item.spotify.artists.join(", ")} - ${item.spotify.title}` : job.title,
        total: job.total,
        createdBy: ctx.user.id,
        createdAt: now,
        updatedAt: now,
      });
      started = { id: jobId };
    }
    review.open = review.open.filter((r) => r.index !== item.index);
    review.answered.push(item.index);
    if (item.spotify?.spotifyId) review.answeredIds = [...(review.answeredIds ?? []), item.spotify.spotifyId];
    await ctx.db.update(radioImports).set({ review: JSON.stringify(review), updatedAt: new Date() }).where(eq(radioImports.id, id));
    return NextResponse.json({ ok: true, started });
  } catch (err) {
    return failure(err, "Could not answer the match");
  }
}
