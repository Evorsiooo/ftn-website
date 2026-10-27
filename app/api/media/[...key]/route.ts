import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key } = await params;
    if (!key || !Array.isArray(key) || key.length === 0) {
      return new NextResponse("File not found", { status: 404 });
    }

    const objectKey = key.join("/");

    // Prevent path traversal attacks
    if (objectKey.includes("..") || objectKey.startsWith("/")) {
      return new NextResponse("Invalid file path", { status: 400 });
    }

    const bucket =
      ((process.env as any).ftn_media as R2Bucket) ||
      ((process.env as any).MEDIA_BUCKET as R2Bucket);

    if (!bucket) {
      return new NextResponse("Media storage unavailable", { status: 503 });
    }

    // Videos are played and skipped around in, which needs byte ranges.
    const rangeHeader = request.headers.get("range");
    const object = await bucket.get(objectKey, rangeHeader ? { range: request.headers } : undefined);

    if (!object || !object.body) {
      return new NextResponse("Media file not found", { status: 404 });
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      object.httpMetadata?.contentType || "application/octet-stream"
    );
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("X-Content-Type-Options", "nosniff");

    if (object.httpEtag) {
      headers.set("ETag", object.httpEtag);
    }

    headers.set("Accept-Ranges", "bytes");
    const range = rangeHeader ? (object as R2ObjectBody).range : undefined;
    if (range && "offset" in range && range.offset !== undefined && range.length !== undefined) {
      headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
      headers.set("Content-Length", String(range.length));
      return new Response(object.body as ReadableStream, { status: 206, headers });
    }

    return new Response(object.body as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error("Media fetch error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
