import {
  canPublishArticles,
  canManageRadio,
  canManageSports,
  canManageAds,
  canManagePosts,
  canAssignRoles,
  canConfigureSite,
} from "@/lib/rbac";

export type AdminBadge = "tips" | "posts" | "drafts";

export interface AdminModule {
  title: string;
  description: string;
  href: string;
  group: string;
  badge?: AdminBadge;
  allowed: (roles: string[]) => boolean;
}

/** Every admin area, in the order shown in the sidebar. Groups are by job, not by table. */
export const ADMIN_MODULES: AdminModule[] = [
  { title: "Articles", group: "Newsroom", badge: "drafts", description: "Write, edit and publish stories.", href: "/admin/articles", allowed: canPublishArticles },
  { title: "Tipline", group: "Newsroom", badge: "tips", description: "Review anonymous leads.", href: "/admin/tips", allowed: (r) => canPublishArticles(r) || canConfigureSite(r) },
  { title: "Schedule", group: "Broadcast", description: "Radio shows, livestreams and the broadcast password.", href: "/admin/radio", allowed: canManageRadio },
  { title: "Sports", group: "Sports", description: "Leagues, rosters, venues and results.", href: "/admin/sports", allowed: canManageSports },
  { title: "Advertisements", group: "Revenue", description: "Ad placements and click metrics.", href: "/admin/ads", allowed: canManageAds },
  { title: "Posts", group: "Newsroom", badge: "posts", description: "Design posts with an ad and send them for approval.", href: "/admin/posts", allowed: canManagePosts },
  { title: "Settings", group: "Site", description: "Site, radio, sign-in, moderation and FTN+.", href: "/admin/settings", allowed: canConfigureSite },
  { title: "Staff roles", group: "Site", description: "Who can do what.", href: "/admin/roles", allowed: canAssignRoles },
];

/** Settings is a set of pages, not one long form. */
export const SETTINGS_PAGES = [
  { title: "Site", href: "/admin/settings", description: "Donation banner, navbar and footer links" },
  { title: "Radio", href: "/admin/settings/radio", description: "Stream and station details" },
  { title: "Connections", href: "/admin/settings/connections", description: "Keys, tokens and passwords: Icecast, password rotation, Discord webhook, album art" },
  { title: "Sign-in and access", href: "/admin/settings/access", description: "Login method, FTN+ and tipline gates, accounts" },
  { title: "Moderation", href: "/admin/settings/moderation", description: "Mutes, auto-moderation, profanity filter" },
  { title: "FTN+ network", href: "/admin/settings/plus", description: "YouTube channels, video catalog, swimlanes" },
] as const;

/** Every settings section, so the jump bar can find a setting by name and open its page. */
export const SETTINGS_SECTIONS = [
  { title: "Donation banner", href: "/admin/settings" },
  { title: "Links (Discord and footer)", href: "/admin/settings" },
  { title: "Webradio stream", href: "/admin/settings/radio" },
  { title: "Station & Discord bot", href: "/admin/settings/radio" },
  { title: "Icecast", href: "/admin/settings/connections" },
  { title: "Password rotation", href: "/admin/settings/connections" },
  { title: "Album art keys", href: "/admin/settings/connections" },
  { title: "Sign-in method", href: "/admin/settings/access" },
  { title: "Access gates (FTN+ and tipline)", href: "/admin/settings/access" },
  { title: "Staff accounts and passwords", href: "/admin/settings/access" },
  { title: "Mute a user", href: "/admin/settings/moderation" },
  { title: "Auto-moderation", href: "/admin/settings/moderation" },
  { title: "Profanity filter", href: "/admin/settings/moderation" },
  { title: "YouTube channels", href: "/admin/settings/plus" },
  { title: "Video catalog", href: "/admin/settings/plus" },
  { title: "Swimlanes", href: "/admin/settings/plus" },
] as const;

export const GROUP_ORDER = ["Newsroom", "Broadcast", "Sports", "Revenue", "Site"];
