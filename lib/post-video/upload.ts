// Browser side of the chunked upload to R2 (see app/api/admin/posts/media/route.ts).
// Files go up in 8 MB parts, so there is no size limit from the request body.

const PART_SIZE = 8 * 1024 * 1024;

export type MediaKind = "source" | "music" | "final" | "poster";

// Some Windows setups give files no type at all, so fall back to the extension.
const TYPES_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  flac: "audio/flac",
};

function contentTypeOf(file: Blob, name: string): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return TYPES_BY_EXTENSION[name.split(".").pop()?.toLowerCase() ?? ""] || file.type;
}

async function call(url: string, init: RequestInit, tries = 3): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, init);
      const data = (await res.json().catch(() => ({}))) as any;
      if (res.ok) return data;
      // A refusal (bad file type, too large, not allowed) will not get better by retrying.
      if (res.status >= 400 && res.status < 500) throw Object.assign(new Error(data.error || `Upload failed (${res.status})`), { fatal: true });
      lastError = new Error(data.error || `Upload failed (${res.status})`);
    } catch (err: any) {
      if (err?.fatal) throw err;
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw lastError || new Error("Upload failed");
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Uploads a file to R2 in parts and returns the URL it is served from. */
export async function uploadMedia(
  file: Blob,
  opts: { kind: MediaKind; name: string; onProgress?: (fraction: number) => void }
): Promise<string> {
  const base = "/api/admin/posts/media";
  const { key, uploadId } = await call(
    base,
    json({ op: "create", kind: opts.kind, name: opts.name, contentType: contentTypeOf(file, opts.name), size: file.size })
  );
  try {
    const parts: { partNumber: number; etag: string }[] = [];
    const count = Math.max(1, Math.ceil(file.size / PART_SIZE));
    for (let n = 1; n <= count; n++) {
      const chunk = file.slice((n - 1) * PART_SIZE, n * PART_SIZE);
      const query = new URLSearchParams({ key, uploadId, part: String(n) });
      const part = await call(`${base}?${query}`, { method: "PUT", body: chunk });
      parts.push({ partNumber: n, etag: part.etag });
      opts.onProgress?.(n / count);
    }
    const done = await call(base, json({ op: "complete", key, uploadId, parts }));
    return done.url as string;
  } catch (err) {
    fetch(base, json({ op: "abort", key, uploadId })).catch(() => {});
    throw err;
  }
}
