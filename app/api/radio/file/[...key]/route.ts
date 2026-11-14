import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Files from the radio's R2 bucket (ftn-radio): the songs, the timeline and
 * the analysis models. Byte ranges are supported because <audio> asks for
 * them. For the radio engine lab only the test/ and models/ folders are
 * served.
 */
const ALLOWED_PREFIXES = ["test/", "models/"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  if (!key?.length) return new NextResponse("Not found", { status: 404 });
  const objectKey = key.join("/");
  if (objectKey.includes("..") || objectKey.startsWith("/") || !ALLOWED_PREFIXES.some((p) => objectKey.startsWith(p))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const bucket = (process.env as unknown as { ftn_radio?: R2Bucket }).ftn_radio;
  if (!bucket) return new NextResponse("Radio storage unavailable", { status: 503 });

  const rangeHeader = request.headers.get("range");
  const object = await bucket.get(objectKey, rangeHeader ? { range: request.headers } : undefined);
  if (!object || !("body" in object) || !object.body) return new NextResponse("Not found", { status: 404 });

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  // the timeline changes; songs and models never do under the same key
  headers.set("Cache-Control", objectKey.endsWith(".json") ? "no-cache" : "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Accept-Ranges", "bytes");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  const range = rangeHeader ? object.range : undefined;
  if (range && "offset" in range && range.offset !== undefined && range.length !== undefined) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    headers.set("Content-Length", String(range.length));
    return new Response(object.body as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(object.size));
  return new Response(object.body as ReadableStream, { status: 200, headers });
}
