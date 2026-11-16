import { NextRequest, NextResponse } from "next/server";
import { KEY_PATTERN, mediaBucket } from "@/lib/og/cards";
import { isCronRequest } from "@/lib/og/auth";

export const runtime = "edge";

const MAX_BYTES = 1_500_000;

// For the link preview workflow: stores one drawn card as og/<key>.jpg.
export async function PUT(request: NextRequest) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = request.nextUrl.searchParams.get("key") || "";
  if (!KEY_PATTERN.test(key)) return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  const bucket = mediaBucket();
  if (!bucket) return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length === 0 || body.length > MAX_BYTES) return NextResponse.json({ error: "Image too large or empty" }, { status: 413 });
  // JPEG only (starts with FF D8 FF)
  if (body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) return NextResponse.json({ error: "Not a JPEG" }, { status: 415 });

  await bucket.put(`og/${key}.jpg`, body, {
    httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" },
  });
  return NextResponse.json({ ok: true, key });
}
