import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * The radio's clock (radio engine lab, plans/radio/timeline.md). Each
 * listener pings this the way BitChord's Listen Together pings its party
 * server: it notes when it asked and when the answer came back, and takes
 * the server time from the quickest round trip. Never cached.
 */
export async function GET(request: NextRequest) {
  const clientMs = Number(request.nextUrl.searchParams.get("c"));
  return NextResponse.json(
    { clientMs: Number.isFinite(clientMs) ? clientMs : null, serverMs: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
