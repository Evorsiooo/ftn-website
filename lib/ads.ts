import { isSafeUrl } from "@/lib/admin-auth";
import { RO_STATES } from "@/lib/ro-states";

export type AdZone = "header_leaderboard" | "sidebar_rectangle" | "in_feed_banner";
export type AdFormat = "1024x180" | "512x180";

// Admin form zone names -> stored zone values.
export const ZONE_MAP: Record<string, AdZone> = {
  homepage_top: "header_leaderboard",
  header_leaderboard: "header_leaderboard",
  articles_inline: "in_feed_banner",
  in_feed_banner: "in_feed_banner",
  sports_sidebar: "sidebar_rectangle",
  sidebar_rectangle: "sidebar_rectangle",
};

export const AD_STATUSES = ["active", "paused", "completed"] as const;

export interface AdInput {
  title?: string;
  organizerId?: string;
  imageUrl?: string;
  targetUrl?: string;
  messageLink?: string | null;
  messageLinks?: Record<string, string | null> | null;
  postImpressionsPurchased?: number | null;
  format?: string;
  zone?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

// Validates the fields present in `body`. With `requireAll` (create) the core fields
// must be present; for updates only the supplied fields are checked and returned.
export function validateAdInput(
  body: AdInput,
  requireAll: boolean
): { error: string } | { values: Record<string, unknown> } {
  const values: Record<string, unknown> = {};

  if (requireAll && (!body.title?.trim() || !body.organizerId || !body.imageUrl?.trim() || !body.targetUrl?.trim())) {
    return { error: "Title, organizer, image and destination URL are required" };
  }

  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) return { error: "Title cannot be empty" };
    if (title.length > 150) return { error: "Ad title exceeds maximum length of 150 characters" };
    values.name = title;
  }

  if (body.imageUrl !== undefined) {
    const imageUrl = body.imageUrl.trim();
    if (!imageUrl || imageUrl.length > 2048 || !isSafeUrl(imageUrl)) {
      return { error: "Image URL must start with http://, https://, or / and be under 2048 characters" };
    }
    values.imageUrl = imageUrl;
  }

  if (body.targetUrl !== undefined) {
    const targetUrl = body.targetUrl.trim();
    if (!targetUrl || targetUrl.length > 2048 || !isSafeUrl(targetUrl)) {
      return { error: "Destination URL must start with http://, https://, or / and be under 2048 characters" };
    }
    values.targetUrl = targetUrl;
  }

  if (body.messageLinks !== undefined) {
    const out: Record<string, string> = {};
    for (const s of RO_STATES) {
      const link = String(body.messageLinks?.[s.key] ?? "").trim();
      if (!link) continue;
      if (link.length > 2048 || !isSafeUrl(link)) {
        return { error: `${s.label} message link must start with http://, https://, or / and be under 2048 characters` };
      }
      out[s.key] = link;
    }
    values.messageLinks = Object.keys(out).length ? JSON.stringify(out) : null;
  }

  if (body.postImpressionsPurchased !== undefined) {
    const n = body.postImpressionsPurchased;
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 100_000_000)) {
      return { error: "Post impressions must be a whole number, or empty for unlimited" };
    }
    values.postImpressionsPurchased = n;
  }

  if (body.format !== undefined) {
    if (body.format !== "1024x180" && body.format !== "512x180") {
      return { error: "Invalid ad format. Must be 1024x180 or 512x180." };
    }
    values.adFormat = body.format;
  }

  if (body.zone !== undefined) {
    const zone = ZONE_MAP[body.zone];
    if (!zone) return { error: "Invalid ad zone" };
    values.zone = zone;
  }

  if (body.status !== undefined) {
    if (!(AD_STATUSES as readonly string[]).includes(body.status)) {
      return { error: "Invalid status" };
    }
    values.status = body.status;
  }

  for (const [key, field] of [["startDate", "startDate"], ["endDate", "endDate"]] as const) {
    const raw = body[key];
    if (raw !== undefined) {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return { error: `Invalid ${field}` };
      values[field] = date;
    }
  }

  return { values };
}
