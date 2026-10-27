import {
  canPublishArticles,
  canManageRadio,
  canManageSports,
  canManageAds,
  canManagePosts,
  canAssignRoles,
  canConfigureSite,
} from "@/lib/rbac";

export interface AdminModule {
  title: string;
  description: string;
  href: string;
  allowed: (roles: string[]) => boolean;
}

/** Every admin area, in the order shown in the sidebar and on the portal. */
export const ADMIN_MODULES: AdminModule[] = [
  { title: "Articles", description: "Create, edit, and publish stories and news investigations.", href: "/admin/articles", allowed: canPublishArticles },
  { title: "Sports Settings", description: "Manage league rosters and record match or race scores.", href: "/admin/sports", allowed: canManageSports },
  { title: "Schedule", description: "Schedule radio shows and livestreams, manage shows and the broadcast password.", href: "/admin/radio", allowed: canManageRadio },
  { title: "Advertisements", description: "Manage banner placements and track click metrics.", href: "/admin/ads", allowed: canManageAds },
  { title: "Posts", description: "Design news posts with an ad, send them for approval and track them.", href: "/admin/posts", allowed: canManagePosts },
  { title: "Tipline", description: "Review anonymous investigative leads and reports.", href: "/admin/tips", allowed: (r) => canPublishArticles(r) || canConfigureSite(r) },
  { title: "Staff Roles", description: "Grant and revoke permissions to Roblox staff members.", href: "/admin/roles", allowed: canAssignRoles },
  { title: "Site Settings", description: "Configure live audio stream URL and system feeds.", href: "/admin/settings", allowed: canConfigureSite },
];
