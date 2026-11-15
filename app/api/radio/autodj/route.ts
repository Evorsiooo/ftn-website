import { NextRequest, NextResponse } from "next/server";
import { checkTimelineChange, type RadioTimeline } from "@/lib/radio/autodj";
import { AUTODJ_KEY, loadLibrary, noStore, radioBucket } from "@/lib/radio/store";

export const runtime = "edge";

/**
 * The AutoDJ's running order (radio engine lab). Listeners' browsers read it,
 * and when it runs short one of them sends a longer one. The website only
 * checks and stores: songs must be in the library, nothing already playing
 * or about to play may change, every mix must stay within safe volume,
 * filter and speed bounds, and the change must build on the stored revision
 * (the first listener to send one wins; the others re-read it).
 */
export async function GET() {
  const bucket = radioBucket();
  if (!bucket) return NextResponse.json({ error: "Radio storage unavailable" }, { status: 503 });
  const obj = await bucket.get(AUTODJ_KEY);
  if (!obj) return NextResponse.json({ error: "nothing stored" }, { status: 404, headers: noStore });
  return new Response(obj.body as ReadableStream, { headers: { "Content-Type": "application/json", ...noStore } });
}

export async function POST(request: NextRequest) {
  const bucket = radioBucket();
  if (!bucket) return NextResponse.json({ error: "Radio storage unavailable" }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "too big" }, { status: 413 });
  let next: unknown;
  try {
    next = (JSON.parse(raw) as { timeline?: unknown }).timeline;
  } catch {
    return NextResponse.json({ error: "not JSON" }, { status: 400 });
  }
  const stored = await bucket.get(AUTODJ_KEY);
  const current = stored ? ((await stored.json()) as RadioTimeline) : null;
  const error = checkTimelineChange(current, next, Date.now(), await loadLibrary(bucket));
  if (error) {
    const stale = current !== null && (next as { rev?: unknown })?.rev !== current.rev + 1;
    return NextResponse.json({ error }, { status: stale ? 409 : 422, headers: noStore });
  }
  // only over the revision that was checked: two listeners sending at once can't both win
  const put = await bucket.put(AUTODJ_KEY, JSON.stringify(next), {
    httpMetadata: { contentType: "application/json" },
    onlyIf: stored ? { etagMatches: stored.etag } : { uploadedBefore: new Date(0) },
  });
  if (!put) return NextResponse.json({ error: "someone else was first" }, { status: 409, headers: noStore });
  return NextResponse.json({ rev: (next as RadioTimeline).rev }, { headers: noStore });
}
