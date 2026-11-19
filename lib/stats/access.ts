import { canConfigureSite, canManageAds, canManagePosts, canManageRadio, canPublishArticles } from "@/lib/rbac";

export type StatsTab = "radio" | "site" | "plus" | "posts";

/** Who sees which Stats tab: each team sees its own numbers; site admins see all of them. */
export const STATS_TABS: { key: StatsTab; label: string; allowed: (roles: string[]) => boolean }[] = [
  { key: "radio", label: "Radio", allowed: canManageRadio },
  { key: "site", label: "Website", allowed: (r) => canConfigureSite(r) || canPublishArticles(r) },
  { key: "plus", label: "FTN+", allowed: (r) => canConfigureSite(r) || canManageRadio(r) },
  { key: "posts", label: "Posts, ads", allowed: (r) => canManagePosts(r) || canManageAds(r) },
];

export const canSeeStats = (roles: string[]) => STATS_TABS.some((t) => t.allowed(roles));
export const STATS_DAYS = [1, 7, 30, 90] as const;
