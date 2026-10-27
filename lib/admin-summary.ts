import { canPublishArticles, canConfigureSite, canManagePosts, canManageRadio, canManageAds } from "@/lib/rbac";
import { expandOccurrences } from "@/lib/schedule-core";
import type { Occurrence } from "@/lib/schedule-core";
import { parseBroadcast } from "@/lib/schedule-client";
import type { ApiBroadcast } from "@/lib/schedule-client";

// What needs a staff member's attention, gathered from the existing admin endpoints.
// Each part is null when the role cannot see it or the request failed.
export interface AdminSummary {
  tips: { unread: number; oldestDays: number } | null;
  posts: { pending: number } | null;
  drafts: { count: number; stale: number } | null;
  onAir: { current: Occurrence | null; upcoming: Occurrence[] } | null;
  adsLow: { id: string; title: string; organizer: string; left: number }[] | null;
}

const TTL_MS = 15000;
let cache: { key: string; at: number; value: Promise<AdminSummary> } | null = null;

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const DAY = 24 * 60 * 60 * 1000;

async function load(roles: string[]): Promise<AdminSummary> {
  const [tipsData, postsData, articlesData, schedData, adsData, orgData] = await Promise.all([
    canPublishArticles(roles) || canConfigureSite(roles) ? getJson("/api/admin/tips") : null,
    canManagePosts(roles) ? getJson("/api/admin/posts") : null,
    canPublishArticles(roles) ? getJson("/api/articles?admin=true") : null,
    canManageRadio(roles) ? getJson("/api/admin/broadcasts") : null,
    canManageAds(roles) ? getJson("/api/admin/ads") : null,
    canManageAds(roles) ? getJson("/api/admin/organizers") : null,
  ]);
  const now = Date.now();

  let tips: AdminSummary["tips"] = null;
  if (tipsData && Array.isArray(tipsData.tips)) {
    const unread = tipsData.tips.filter((t: any) => t.status === "unread");
    const oldest = unread.reduce((m: number, t: any) => Math.min(m, new Date(t.createdAt).getTime()), now);
    tips = { unread: unread.length, oldestDays: unread.length ? Math.floor((now - oldest) / DAY) : 0 };
  }

  const posts =
    postsData && Array.isArray(postsData.posts) ? { pending: postsData.posts.filter((p: any) => p.status === "pending").length } : null;

  let drafts: AdminSummary["drafts"] = null;
  if (articlesData && Array.isArray(articlesData.articles)) {
    const d = articlesData.articles.filter((a: any) => a.status === "draft");
    drafts = { count: d.length, stale: d.filter((a: any) => now - new Date(a.createdAt).getTime() > 7 * DAY).length };
  }

  let onAir: AdminSummary["onAir"] = null;
  if (schedData && Array.isArray(schedData.shows) && Array.isArray(schedData.broadcasts)) {
    const list = (schedData.broadcasts as ApiBroadcast[]).map(parseBroadcast);
    const occ = expandOccurrences(schedData.shows, list, new Date(now), new Date(now + 8 * DAY), false);
    onAir = {
      current: occ.find((o) => o.start.getTime() <= now && o.end.getTime() > now) ?? null,
      upcoming: occ.filter((o) => o.start.getTime() > now).slice(0, 3),
    };
  }

  let adsLow: AdminSummary["adsLow"] = null;
  if (adsData && Array.isArray(adsData.campaigns)) {
    const orgs = new Map<string, string>((orgData?.organizers ?? []).map((o: any) => [o.id, o.name]));
    adsLow = adsData.campaigns
      .filter((c: any) => c.status === "active" && typeof c.impressionsLeft === "number" && c.impressionsLeft > 0 && c.impressionsLeft <= 20)
      .map((c: any) => ({ id: c.id, title: c.title || c.name, organizer: orgs.get(c.organizerId) ?? "", left: c.impressionsLeft }));
  }

  return { tips, posts, drafts, onAir, adsLow };
}

export function fetchAdminSummary(roles: string[]): Promise<AdminSummary> {
  const key = roles.slice().sort().join(",");
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = load(roles);
  cache = { key, at: Date.now(), value };
  return value;
}

export function refreshAdminSummary() {
  cache = null;
}
