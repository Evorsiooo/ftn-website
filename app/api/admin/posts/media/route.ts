import { NextRequest, NextResponse } from "next/server";
import { canManagePosts } from "@/lib/rbac";
import { requireStaff } from "@/lib/admin-auth";
import { MAX_VIDEO_BYTES } from "@/lib/post-video/model";

export const runtime = "edge";

const FORBIDDEN = "Forbidden: Staff permissions required";

// Videos and songs are uploaded from the browser to R2 in parts, so the file size is not
// limited by the request body size of the site.
const MB = 1024 * 1024;
const KINDS: Record<string, { types: Record<string, string>; maxBytes: number }> = {
  // Imported video clips the post is cut from (kept so the post can be edited again).
  source: {
    types: {
      "video/mp4": "mp4",
      "video/x-m4v": "mp4",
      "video/quicktime": "mov",
      "video/webm": "webm",
      "video/x-matroska": "mkv",
    },
    maxBytes: 1536 * MB,
  },
  music: {
    types: {
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
      "audio/aac": "aac",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/ogg": "ogg",
      "audio/flac": "flac",
      "audio/webm": "weba",
      "video/mp4": "mp4",
    },
    maxBytes: 200 * MB,
  },
  // The finished post video (MP4) or animated WebP. Discord refuses larger files.
  final: { types: { "video/mp4": "mp4", "video/webm": "webm", "image/webp": "webp" }, maxBytes: MAX_VIDEO_BYTES },
};

const KEY_PATTERN = /^posts\/media\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/;
const PART_MAX_BYTES = 16 * MB;

function bucketOf(): R2Bucket | null {
  return (((process.env as any).ftn_media as R2Bucket) || ((process.env as any).MEDIA_BUCKET as R2Bucket)) ?? null;
}

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Starts an upload: POST { op: "create", kind, name, contentType, size }.
// Finishes it: POST { op: "complete", key, uploadId, parts } or { op: "abort", key, uploadId }.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManagePosts, FORBIDDEN);
    if ("error" in auth) return auth.error;
    const bucket = bucketOf();
    if (!bucket) return fail("Media storage unavailable", 503);

    const body = (await request.json().catch(() => ({}))) as any;

    if (body.op === "create") {
      const kind = KINDS[String(body.kind)];
      if (!kind) return fail("Unknown upload type");
      const contentType = String(body.contentType || "").toLowerCase().split(";")[0].trim();
      const extension = kind.types[contentType];
      if (!extension) return fail(`This file type is not supported (${contentType || "unknown type"})`);
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0) return fail("Empty file");
      if (size > kind.maxBytes) {
        return fail(`The file is larger than the ${Math.round(kind.maxBytes / MB)} MB limit`);
      }
      const now = new Date();
      const key = `posts/media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${extension}`;
      const upload = await bucket.createMultipartUpload(key, {
        httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
        customMetadata: { uploadedBy: auth.user.id, originalName: String(body.name || "").slice(0, 100), kind: String(body.kind) },
      });
      return NextResponse.json({ key, uploadId: upload.uploadId });
    }

    const key = String(body.key || "");
    const uploadId = String(body.uploadId || "");
    if (!KEY_PATTERN.test(key) || !uploadId) return fail("Invalid upload");
    const upload = bucket.resumeMultipartUpload(key, uploadId);

    if (body.op === "abort") {
      await upload.abort().catch(() => {});
      return NextResponse.json({ success: true });
    }

    if (body.op === "complete") {
      const parts = Array.isArray(body.parts) ? body.parts : [];
      if (parts.length === 0 || parts.length > 400) return fail("Invalid upload");
      const object = await upload.complete(
        parts.map((p: any) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) }))
      );
      // The size and type chosen at the start must hold for what was actually uploaded.
      const kind = KINDS[String(object.customMetadata?.kind)];
      if (!kind || object.size > kind.maxBytes) {
        await bucket.delete(key);
        return fail("The uploaded file is too large");
      }
      return NextResponse.json({ url: `/api/media/${key}`, size: object.size });
    }
    return fail("Unknown action");
  } catch (error) {
    console.error("Post media upload error:", error);
    return fail("Upload failed", 500);
  }
}

// Uploads one part: PUT ?key=...&uploadId=...&part=N with the bytes as the body.
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireStaff(request, canManagePosts, FORBIDDEN);
    if ("error" in auth) return auth.error;
    const bucket = bucketOf();
    if (!bucket) return fail("Media storage unavailable", 503);

    const url = new URL(request.url);
    const key = url.searchParams.get("key") || "";
    const uploadId = url.searchParams.get("uploadId") || "";
    const partNumber = Number(url.searchParams.get("part"));
    if (!KEY_PATTERN.test(key) || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 400) {
      return fail("Invalid upload");
    }
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > PART_MAX_BYTES) return fail("Invalid part size");

    const part = await bucket.resumeMultipartUpload(key, uploadId).uploadPart(partNumber, bytes);
    return NextResponse.json({ partNumber: part.partNumber, etag: part.etag });
  } catch (error) {
    console.error("Post media part error:", error);
    return fail("Upload failed", 500);
  }
}
