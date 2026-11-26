import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adCampaigns, articles, organizers, posts, radioImports, radioReports, tips } from "@/db/schema";
import { requireStaff } from "@/lib/admin-auth";
import { canManageAds, canManagePosts, canManageRadio, canPublishArticles } from "@/lib/rbac";
import { loadShowsAndBroadcasts } from "@/lib/schedule";
import { serializeBroadcast } from "@/lib/broadcast-admin";
import { openImportState, parseReview } from "@/lib/radio/library";

export const runtime = "edge";

const DAY = 24 * 60 * 60 * 1000;

/**
 * What the admin sidebar and the admin home show as "needs attention", for the signed-in staff member's roles.
 * Each part is null when the role can't see it. Every admin tab asks for this once a minute, so it only runs
 * small indexed counts. It used to load seven whole lists (every tip, post, article, ad and import) instead,
 * and loading the imports also ran the album-audio summary over the whole song library.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, (roles) => roles.length > 0);
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  const db = getDb(d1);
  const roles = auth.user.roles || [];
  const now = Date.now();

  const part = async <T,>(allowed: boolean, load: () => Promise<T>): Promise<T | null> => {
    if (!allowed) return null;
    try {
      return await load();
    } catch (err) {
      console.warn("Admin summary part failed:", err);
      return null;
    }
  };

  const [tipsPart, postsPart, draftsPart, schedule, adsLow, imports, reports] = await Promise.all([
    // tips_status_idx: reads only the unread tips
    part(canPublishArticles(roles), async () => {
      const [r] = await db
        .select({ n: sql<number>`count(*)`, oldest: sql<number | null>`min(${tips.createdAt})` })
        .from(tips)
        .where(eq(tips.status, "unread"));
      const unread = Number(r?.n ?? 0);
      const oldest = r?.oldest == null ? now : Number(r.oldest) * 1000;
      return { unread, oldestDays: unread ? Math.floor((now - oldest) / DAY) : 0 };
    }),
    // posts_status_idx: reads only the pending posts
    part(canManagePosts(roles), async () => {
      const [r] = await db
        .select({ n: sql<number>`count(*)` })
        .from(posts)
        .where(and(eq(posts.status, "pending"), isNull(posts.scheduledAt)));
      return { pending: Number(r?.n ?? 0) };
    }),
    // articles_status_published_idx: reads only the drafts
    part(canPublishArticles(roles), async () => {
      const [r] = await db
        .select({
          n: sql<number>`count(*)`,
          stale: sql<number>`sum(${articles.createdAt} < ${Math.floor((now - 7 * DAY) / 1000)})`,
        })
        .from(articles)
        .where(eq(articles.status, "draft"));
      return { count: Number(r?.n ?? 0), stale: Number(r?.stale ?? 0) };
    }),
    // the shows and broadcasts (a few rows each); the browser works out what's on air
    part(canManageRadio(roles), async () => {
      const { shows, broadcasts } = await loadShowsAndBroadcasts(db);
      return { shows, broadcasts: broadcasts.map(serializeBroadcast) };
    }),
    // ad campaigns are a handful of rows
    part(canManageAds(roles), async () => {
      const rows = await db
        .select({
          id: adCampaigns.id,
          name: adCampaigns.name,
          purchased: adCampaigns.postImpressionsPurchased,
          used: adCampaigns.postImpressionsUsed,
          organizer: organizers.name,
        })
        .from(adCampaigns)
        .leftJoin(organizers, eq(organizers.id, adCampaigns.organizerId))
        .where(eq(adCampaigns.status, "active"));
      return rows
        .map((c) => ({ ...c, left: c.purchased === null ? null : Math.max(0, c.purchased - c.used) }))
        .filter((c): c is typeof c & { left: number } => typeof c.left === "number" && c.left > 0 && c.left <= 20)
        .map((c) => ({ id: c.id, title: c.name, organizer: c.organizer ?? "", left: c.left }));
    }),
    // radio_imports_state_idx for running imports; radio_imports_review_idx (partial: only imports with songs
    // waiting for a pick) for the review count. Both read nothing when there is nothing to show.
    part(canManageRadio(roles), async () => {
      const [running] = await db.select({ n: sql<number>`count(*)` }).from(radioImports).where(openImportState());
      const withReview = await db
        .select({ review: radioImports.review })
        .from(radioImports)
        .where(sql`${radioImports.review} LIKE '%"open":[{%'`);
      const review = withReview.reduce((n, r) => n + parseReview(r.review).open.length, 0);
      return { review, running: Number(running?.n ?? 0) };
    }),
    // radio_reports_status_idx: reads only the new reports
    part(canManageRadio(roles), async () => {
      const [r] = await db.select({ n: sql<number>`count(*)` }).from(radioReports).where(eq(radioReports.status, "new"));
      return { new: Number(r?.n ?? 0) };
    }),
  ]);

  return NextResponse.json(
    { tips: tipsPart, posts: postsPart, drafts: draftsPart, schedule, adsLow, imports, reports },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
