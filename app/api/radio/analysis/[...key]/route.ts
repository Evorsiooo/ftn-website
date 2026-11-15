import { NextRequest, NextResponse } from "next/server";
import { checkAnalysis } from "@/lib/radio/autodj";
import { analysisKey, loadLibrary, noStore, radioBucket } from "@/lib/radio/store";

export const runtime = "edge";

/**
 * A song's shared analysis (radio engine lab): BitChord's TrackAnalysis, made
 * in the browser of the first listener who needed it. Checked before it's
 * stored (this song, this analysis version, bounded plain data), and the
 * first one stored is kept.
 */
async function songOf(params: Promise<{ key: string[] }>) {
  const { key } = await params;
  return key?.join("/") ?? "";
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const bucket = radioBucket();
  if (!bucket) return NextResponse.json({ error: "Radio storage unavailable" }, { status: 503 });
  const song = await songOf(params);
  const library = await loadLibrary(bucket);
  if (!library.has(song)) return NextResponse.json({ error: "not in the library" }, { status: 404 });
  const obj = await bucket.get(analysisKey(song));
  if (!obj) return NextResponse.json({ error: "not analysed yet" }, { status: 404, headers: noStore });
  return new Response(obj.body as ReadableStream, { headers: { "Content-Type": "application/json", ...noStore } });
}

export async function HEAD(request: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const res = await GET(request, ctx);
  return new Response(null, { status: res.status, headers: res.headers });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const bucket = radioBucket();
  if (!bucket) return NextResponse.json({ error: "Radio storage unavailable" }, { status: 503 });
  const song = await songOf(params);
  const library = await loadLibrary(bucket);
  if (await bucket.head(analysisKey(song))) return NextResponse.json({ kept: "first one" }, { headers: noStore });
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
  return NextResponse.json({ stored: true }, { status: 201, headers: noStore });
}
