import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { checkAnalysis } from "@/lib/radio/autodj";
import { songsByKeys } from "@/lib/radio/library";
import { markAnalysed } from "@/lib/radio/prep";
import { radioAdmin } from "@/lib/radio/admin-route";
import { analysisKey, noStore, radioBucket, radioDb } from "@/lib/radio/store";

export const runtime = "edge";

/**
 * Shares a song's analysis: BitChord's TrackAnalysis, made in a staff member's
 * browser (Prepare on the Library page, or a broadcaster's Studio tab).
 * Listeners read it from the bucket's public domain. Only signed-in radio staff
 * may store one (Adrien, 2026-11-26: nobody else can send fake results), and it
 * is checked before it's stored (this song, this analysis version, bounded
 * plain data); the first one stored is kept.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  // before anything is read: a visitor who isn't radio staff costs one session check, nothing more
  const staff = await radioAdmin(request);
  if ("error" in staff) return staff.error;
  const bucket = radioBucket();
  const db = radioDb();
  if (!bucket || !db) return NextResponse.json({ error: "Radio storage unavailable" }, { status: 503 });
  const song = (await params).key?.join("/") ?? "";
  const library = await songsByKeys(getDb(db), [song]);
  if (!library.has(song)) return NextResponse.json({ error: "not in the library" }, { status: 404, headers: noStore });
  if (await bucket.head(analysisKey(song))) {
    // already shared (by a listener, or another PC): the song counts as analysed all the same
    await markAnalysed(getDb(db), [song]);
    return NextResponse.json({ kept: "first one" }, { headers: noStore });
  }
  const raw = await request.text();
  if (raw.length > 1_500_000) return NextResponse.json({ error: "too big" }, { status: 413 });
  let analysis: unknown;
  try {
    analysis = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "not JSON" }, { status: 400 });
  }
  const error = checkAnalysis(analysis, song, library.get(song));
  if (error) return NextResponse.json({ error }, { status: 422, headers: noStore });
  await bucket.put(analysisKey(song), raw, { httpMetadata: { contentType: "application/json" } });
  // Getting ready: one step of the two done (the other is the title check)
  await markAnalysed(getDb(db), [song]);
  return NextResponse.json({ stored: true }, { status: 201, headers: noStore });
}
