import { canSeeStats } from "@/lib/stats/access";
import {
  canPublishArticles,
  canManageRadio,
  canManageSports,
  canManageAds,
  canManagePosts,
  canAssignRoles,
  canConfigureSite,
  canModerateUsers,
} from "@/lib/rbac";

export type AdminBadge = "tips" | "posts" | "drafts" | "imports";

export interface AdminModule {
  title: string;
  description: string;
  href: string;
  group: string;
  badge?: AdminBadge;
  /** Other address prefixes that belong to this entry (they light it up in the sidebar). */
  also?: string[];
  allowed: (roles: string[]) => boolean;
}

/** Every admin area, in sidebar order. Groups are by job, not by table. */
export const ADMIN_MODULES: AdminModule[] = [
  { title: "Posts", group: "Newsroom", badge: "posts", description: "Design posts with an ad and send them for approval.", href: "/admin/posts", allowed: canManagePosts },
  { title: "Articles", group: "Newsroom", badge: "drafts", description: "Write, edit and publish stories.", href: "/admin/articles", allowed: canPublishArticles },
  { title: "Tipline", group: "Newsroom", badge: "tips", description: "Anonymous leads from readers.", href: "/admin/tips", allowed: (r) => canPublishArticles(r) || canConfigureSite(r) },
  { title: "Schedule", group: "Radio", description: "Radio shows and livestreams. Go on air from the Studio.", href: "/admin/schedule", allowed: canManageRadio },
  { title: "Song library", group: "Radio", badge: "imports", description: "The radio's songs, playlists and ratings.", href: "/admin/radio/library", also: ["/admin/radio"], allowed: canManageRadio },
  { title: "FTN+ content", group: "Network", description: "YouTube and Twitch channels, the video catalog and the rows on FTN+.", href: "/admin/plus", allowed: canConfigureSite },
  { title: "Sports", group: "Network", description: "Leagues, teams, venues, schedule and results.", href: "/admin/sports", allowed: canManageSports },
  { title: "Ads", group: "Network", description: "Advertisers, their ads, and how they perform.", href: "/admin/ads", allowed: canManageAds },
  { title: "Stats", group: "Site", description: "Radio listeners, visitors, FTN+ views, posts and ads over time.", href: "/admin/stats", allowed: canSeeStats },
  { title: "People", group: "Site", description: "Staff roles, staff accounts and muted users.", href: "/admin/people", also: ["/admin/roles"], allowed: (r) => canAssignRoles(r) || canModerateUsers(r) || canConfigureSite(r) },
  { title: "Settings", group: "Site", description: "Site, sign-in, radio and integrations.", href: "/admin/settings", allowed: canConfigureSite },
];

export const GROUP_ORDER = ["Newsroom", "Radio", "Network", "Site"];

/** Settings is four short pages, not one long form. */
export const SETTINGS_PAGES = [
  { key: "site", title: "Site", href: "/admin/settings", description: "Donation banner, Discord link and footer links" },
  { key: "access", title: "Sign-in", href: "/admin/settings/access", description: "How staff sign in, and who can see FTN+ and the tipline" },
  { key: "radio", title: "Radio", href: "/admin/settings/radio", description: "Station, stream, broadcasting from OBS and the Discord bot" },
  { key: "connections", title: "Integrations", href: "/admin/settings/connections", description: "Icecast, password rotation and album art keys" },
  { key: "ai", title: "AI access", href: "/admin/settings/ai", description: "Connect Claude, ChatGPT or Gemini, approvals and the audit log" },
] as const;

/** Every setting by name, so the jump bar can open the page it lives on. */
export const SETTINGS_SECTIONS = [
  { title: "Donation banner", href: "/admin/settings" },
  { title: "Discord and footer links", href: "/admin/settings" },
  { title: "Sign-in method", href: "/admin/settings/access" },
  { title: "Account creation", href: "/admin/settings/access" },
  { title: "Who can see FTN+ and the tipline", href: "/admin/settings/access" },
  { title: "Radio station and stream", href: "/admin/settings/radio" },
  { title: "Broadcasting from OBS (server and password)", href: "/admin/settings/radio" },
  { title: "Radio Discord bot", href: "/admin/settings/radio" },
  { title: "Icecast", href: "/admin/settings/connections" },
  { title: "Password rotation", href: "/admin/settings/connections" },
  { title: "Album art keys", href: "/admin/settings/connections" },
  { title: "Staff accounts and passwords", href: "/admin/people?tab=accounts" },
  { title: "Mute a user", href: "/admin/people?tab=muted" },
  { title: "Auto-moderation and profanity filter", href: "/admin/people?tab=muted" },
  { title: "YouTube and Twitch channels", href: "/admin/plus" },
  { title: "Video catalog", href: "/admin/plus?tab=videos" },
  { title: "Rows on FTN+ (swimlanes)", href: "/admin/plus?tab=rows" },
  { title: "AI access (Claude, ChatGPT, Gemini)", href: "/admin/settings/ai" },
  { title: "Audit log", href: "/admin/settings/ai" },
] as const;
