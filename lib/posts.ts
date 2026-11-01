import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { DbClient } from "@/db";
import { adCampaigns, posts } from "@/db/schema";
import { isSafeUrl } from "@/lib/admin-auth";
import { RO_STATES, type RoState } from "@/lib/ro-states";

export { RO_STATES, type RoState };

const LOGO_KEYS = ["", "whcn", "ch4"];

export interface PostInput {
  headline?: string;
  body?: string;
  logo?: string;
  roState?: string;
  adId?: string | null;
  noAd?: boolean;
  backgroundUrl?: string | null;
  imageUrl?: string;
  mediaType?: "image" | "video";
  videoUrl?: string | null;
  videoEdit?: string | null;
  /** Epoch milliseconds the post should be sent to Discord, or null/absent to send now. */
  scheduledAt?: number | null;
  /** Create: save as a draft. Update of a draft: publish it (send now, or at scheduledAt). */
  draft?: boolean;
  publish?: boolean;
}

const MAX_VIDEO_EDIT_LENGTH = 100_000;

// Uploads for posts always live under posts/ in R2, served by /api/media.
function isPostMediaUrl(url: string): boolean {
  return url.startsWith("/api/media/posts/") && !url.includes("..") && url.length <= 512;
}

export function validatePostInput(
  input: PostInput,
  requireAll: boolean
): { error: string } | { values: Record<string, unknown> } {
  const values: Record<string, unknown> = {};

  if (requireAll && (!input.headline?.trim() || !input.roState || !input.imageUrl)) {
    return { error: "Headline, Ro-State and the generated image are required" };
  }
  if (requireAll && input.mediaType === "video" && !input.videoUrl) {
    return { error: "A video post needs its video" };
  }

  if (input.headline !== undefined) {
    const headline = input.headline.trim();
    if (!headline || headline.length > 200) return { error: "Headline must be 1 to 200 characters" };
    values.headline = headline;
  }
  if (input.body !== undefined) {
    if (input.body.length > 2000) return { error: "Body exceeds 2000 characters" };
    values.body = input.body.trim();
  }
  if (input.logo !== undefined) {
    if (!LOGO_KEYS.includes(input.logo)) return { error: "Unknown logo" };
    values.logo = input.logo;
  }
  if (input.roState !== undefined) {
    if (!RO_STATES.some((s) => s.key === input.roState)) return { error: "Choose a valid Ro-State" };
    values.roState = input.roState;
  }
  if (input.noAd !== undefined) values.noAd = input.noAd === true;
  if (input.imageUrl !== undefined) {
    if (!isPostMediaUrl(input.imageUrl)) return { error: "Invalid generated image" };
    values.imageUrl = input.imageUrl;
  }
  if (input.mediaType !== undefined) {
    if (input.mediaType !== "image" && input.mediaType !== "video") return { error: "Unknown post type" };
    values.mediaType = input.mediaType;
    // An image post has no video.
    if (input.mediaType === "image") {
      values.videoUrl = null;
      values.videoEdit = null;
    }
  }
  if (input.videoUrl !== undefined && input.mediaType !== "image") {
    if (input.videoUrl !== null && !isPostMediaUrl(input.videoUrl)) return { error: "Invalid video" };
    values.videoUrl = input.videoUrl;
  }
  if (input.videoEdit !== undefined && input.mediaType !== "image") {
    if (input.videoEdit !== null && input.videoEdit.length > MAX_VIDEO_EDIT_LENGTH) {
      return { error: "The video edit is too large to save" };
    }
    values.videoEdit = input.videoEdit;
  }
  if (input.backgroundUrl !== undefined) {
    if (input.backgroundUrl !== null && !isPostMediaUrl(input.backgroundUrl)) {
      return { error: "Invalid background image" };
    }
    values.backgroundUrl = input.backgroundUrl;
  }
  return { values };
}

// Link used in the Discord message: the ad's message link, else its destination URL.
export function parseMessageLinks(raw: string | null | undefined): Record<string, string> {
  try {
    const obj = JSON.parse(raw || "{}");
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

// Link used in the Discord message: the ad's message link for the post's Ro-State,
// else its destination URL.
export function resolveMessageLink(ad: { messageLinks: string | null; targetUrl: string }, roState: string): string | null {
  const link = parseMessageLinks(ad.messageLinks)[roState] || ad.targetUrl;
  return link && isSafeUrl(link) ? link : null;
}

// Ads that can be put on a post: active, 1024x180, with post impressions left.
export function eligibleAdFilter() {
  return and(
    eq(adCampaigns.status, "active"),
    eq(adCampaigns.adFormat, "1024x180"),
    or(
      isNull(adCampaigns.postImpressionsPurchased),
      lt(adCampaigns.postImpressionsUsed, adCampaigns.postImpressionsPurchased)
    )
  );
}

// Takes one post impression from an ad. Returns false if the ad has none left.
export async function consumeAdImpression(db: DbClient, adId: string): Promise<boolean> {
  const updated = await db
    .update(adCampaigns)
    .set({ postImpressionsUsed: sql`${adCampaigns.postImpressionsUsed} + 1` })
    .where(
      and(
        eq(adCampaigns.id, adId),
        eq(adCampaigns.status, "active"),
        or(
          isNull(adCampaigns.postImpressionsPurchased),
          lt(adCampaigns.postImpressionsUsed, adCampaigns.postImpressionsPurchased)
        )
      )
    )
    .returning({ id: adCampaigns.id });
  return updated.length > 0;
}

export async function releaseAdImpression(db: DbClient, adId: string | null): Promise<void> {
  if (!adId) return;
  await db
    .update(adCampaigns)
    .set({ postImpressionsUsed: sql`max(${adCampaigns.postImpressionsUsed} - 1, 0)` })
    .where(eq(adCampaigns.id, adId));
}

// Rotation: the eligible ad whose last post is oldest (never-used ads first).
export async function suggestAdId(db: DbClient): Promise<{ ads: any[]; suggestedAdId: string | null }> {
  const ads = await db.select().from(adCampaigns).where(eligibleAdFilter());
  const lastUsed = await db
    .select({ adId: posts.adId, last: sql<number>`max(${posts.createdAt})` })
    .from(posts)
    .groupBy(posts.adId);
  const lastByAd = new Map<string, number>();
  for (const row of lastUsed) if (row.adId) lastByAd.set(row.adId, Number(row.last));

  const sorted = [...ads].sort(
    (a, b) =>
      (lastByAd.get(a.id) ?? 0) - (lastByAd.get(b.id) ?? 0) ||
      a.createdAt.getTime() - b.createdAt.getTime()
  );
  return { ads: sorted, suggestedAdId: sorted[0]?.id ?? null };
}
