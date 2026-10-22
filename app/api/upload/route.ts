import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { canManageAds, canManagePosts, canManageRadio, canPublishArticles } from "@/lib/rbac";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "edge";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Upload folders and the permission each one requires. The folder is chosen by the
// client via the optional "folder" form field; "articles" is the default so the
// article editor keeps working unchanged.
const UPLOAD_FOLDERS: Record<string, (roles: string[]) => boolean> = {
  articles: canPublishArticles,
  ads: canManageAds,
  posts: canManagePosts,
  radio: canManageRadio,
};

function validateMagicBytes(buffer: Uint8Array, mime: string): boolean {
  if (buffer.length < 12) return false;

  // JPEG: FF D8 FF
  if (mime === "image/jpeg" || mime === "image/jpg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (mime === "image/png") {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }

  // GIF: GIF87a or GIF89a (47 49 46 38)
  if (mime === "image/gif") {
    return (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    );
  }

  // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (mime === "image/webp") {
    const isRiff =
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46;
    const isWebp =
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;
    return isRiff && isWebp;
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication & Permission Verification
    const authHeader = request.headers.get("authorization");
    const token =
      authHeader?.replace("Bearer ", "") ||
      request.cookies.get("ftn_session")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: Please sign in to upload images." },
        { status: 401 }
      );
    }

    const user = await verifySessionToken(token);
    if (!user || !user.roles || user.roles.length === 0) {
      return NextResponse.json(
        { error: "Forbidden: Staff permissions required." },
        { status: 403 }
      );
    }

    // 2. Rate Limiting: Max 20 uploads per 60 seconds per user
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(`upload:${user.id || clientIp}`, 20, 60);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Upload rate limit exceeded. Please wait ${rateLimit.resetInSeconds}s before uploading again.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.resetInSeconds) },
        }
      );
    }

    // 3. Parse Multipart Form Data
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { error: "Invalid form data submission." },
        { status: 400 }
      );
    }

    const folderField = formData.get("folder");
    const folder = typeof folderField === "string" && folderField ? folderField : "articles";
    const isAllowed = Object.hasOwn(UPLOAD_FOLDERS, folder) ? UPLOAD_FOLDERS[folder] : undefined;
    if (!isAllowed) {
      return NextResponse.json({ error: "Invalid upload folder." }, { status: 400 });
    }
    if (!isAllowed(user.roles)) {
      return NextResponse.json(
        { error: `Forbidden: you do not have permission to upload to "${folder}".` },
        { status: 403 }
      );
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "No image file provided." },
        { status: 400 }
      );
    }

    // 4. Validate File Size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File size exceeds the 10MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
        },
        { status: 400 }
      );
    }

    // 5. Validate MIME Type & Extension
    const mime = file.type.toLowerCase().trim();
    const extension = ALLOWED_MIME_TYPES[mime];

    if (!extension) {
      return NextResponse.json(
        {
          error:
            "Invalid file format. Only JPEG, PNG, WebP, and GIF images are permitted.",
        },
        { status: 400 }
      );
    }

    // 6. Magic Bytes Inspection
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    if (!validateMagicBytes(bytes, mime)) {
      return NextResponse.json(
        {
          error:
            "Security check failed: File header signature does not match declared image format.",
        },
        { status: 400 }
      );
    }

    // 7. Store into Cloudflare R2 Bucket
    const bucket =
      ((process.env as any).ftn_media as R2Bucket) ||
      ((process.env as any).MEDIA_BUCKET as R2Bucket);

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const uniqueKey = `${folder}/${year}/${month}/${crypto.randomUUID()}.${extension}`;

    if (bucket) {
      await bucket.put(uniqueKey, arrayBuffer, {
        httpMetadata: {
          contentType: mime,
          cacheControl: "public, max-age=31536000, immutable",
        },
        customMetadata: {
          uploadedBy: user.id,
          originalName: file.name.slice(0, 100),
          uploadedAt: now.toISOString(),
        },
      });
    }

    const publicUrl = `/api/media/${uniqueKey}`;

    return NextResponse.json(
      {
        success: true,
        url: publicUrl,
        key: uniqueKey,
        size: file.size,
        mime: mime,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image. Please try again." },
      { status: 500 }
    );
  }
}
