import { NextRequest, NextResponse } from "next/server";
import { radioSongs } from "@/db/schema";
import { failure, radioAdmin } from "@/lib/radio/admin-route";
import { duplicateCandidates, findDuplicate, radioBucket } from "@/lib/radio/library";

export const runtime = "edge";

const MAX_BYTES = 40 * 1024 * 1024;
// Formats every listener's browser plays, iPhones included.
const TYPES: Record<string, { ext: string; contentType: string }> = {
  m4a: { ext: "m4a", contentType: "audio/mp4" },
  mp4: { ext: "m4a", contentType: "audio/mp4" },
  aac: { ext: "aac", contentType: "audio/aac" },
  mp3: { ext: "mp3", contentType: "audio/mpeg" },
};

/**
 * Upload an audio file straight to R2 (no VPS). The uploader's browser decodes the file first and
 * sends its duration and loudness (EBU R128, as LUFS + 14 like YouTube's figure) with it.
 */
export async function POST(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const bucket = radioBucket();
  if (!bucket) return NextResponse.json({ error: "Radio storage unavailable" }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "Choose an audio file." }, { status: 400 });
  const type = TYPES[(file.name.split(".").pop() || "").toLowerCase()];
  if (!type) return NextResponse.json({ error: "Use an .m4a, .aac or .mp3 file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "The file is over 40 MB." }, { status: 400 });

  const title = String(form.get("title") ?? "").trim();
  const artist = String(form.get("artist") ?? "").trim();
  const durationSec = Number(form.get("durationSec"));
  const loudnessRaw = form.get("loudnessDb");
  const loudnessDb = loudnessRaw === null || loudnessRaw === "" ? null : Number(loudnessRaw);
  if (!title || title.length > 300 || !artist || artist.length > 300) return NextResponse.json({ error: "Title and artist are required." }, { status: 400 });
  if (!Number.isFinite(durationSec) || durationSec < 5 || durationSec > 3 * 3600) return NextResponse.json({ error: "Could not read the song's length." }, { status: 400 });
  if (loudnessDb !== null && (!Number.isFinite(loudnessDb) || loudnessDb < -60 || loudnessDb > 30)) return NextResponse.json({ error: "Bad loudness figure." }, { status: 400 });

  const same = findDuplicate({ title, artist, durationSec }, await duplicateCandidates(ctx.db, { durationSec }));
  if (same) return NextResponse.json({ error: `Already in the library: “${same.title}” by ${same.artist}.` }, { status: 409 });

  const id = crypto.randomUUID();
  const r2Key = `songs/upload/${id}.${type.ext}`;
  try {
    await bucket.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: { contentType: type.contentType, cacheControl: "public, max-age=31536000, immutable" },
    });
    const now = new Date();
    const [song] = await ctx.db
      .insert(radioSongs)
      .values({ id, r2Key, source: "upload", title, artist, durationSec, loudnessDb, bytes: file.size, contentType: type.contentType, addedBy: ctx.user.id, createdAt: now, updatedAt: now })
      .returning();
    return NextResponse.json({ song }, { status: 201 });
  } catch (err) {
    await bucket.delete(r2Key).catch(() => {});
    return failure(err, "Could not upload the song");
  }
}
