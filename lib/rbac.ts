export type DivisionRole =
  | "site_admin"
  | "manager"
  | "broadcast_division"
  | "digital_publishing"
  | "commercial_division"
  | "graphic_design"
  | "sports_division";

export function hasPermission(
  userRoles: string[] = [],
  requiredRole: DivisionRole
): boolean {
  if (userRoles.includes("site_admin")) return true;
  if (userRoles.includes("manager")) return true;
  return userRoles.includes(requiredRole);
}

export function canPublishArticles(roles: string[] = []): boolean {
  return hasPermission(roles, "digital_publishing");
}

export function canManageSports(roles: string[] = []): boolean {
  return hasPermission(roles, "sports_division");
}

export function canManageRadio(roles: string[] = []): boolean {
  return hasPermission(roles, "broadcast_division");
}

export function canManageAds(roles: string[] = []): boolean {
  return hasPermission(roles, "commercial_division");
}

const ALL_DIVISION_ROLES: DivisionRole[] = [
  "site_admin",
  "manager",
  "broadcast_division",
  "digital_publishing",
  "commercial_division",
  "graphic_design",
  "sports_division",
];

// Posts: every staff role may create and view posts.
export function canManagePosts(roles: string[] = []): boolean {
  return roles.some((r) => ALL_DIVISION_ROLES.includes(r as DivisionRole));
}

// Posts: leadership may approve/deny, and delete other people's posts.
export function isPostsLeadership(roles: string[] = []): boolean {
  return roles.includes("site_admin") || roles.includes("manager");
}

export function canAssignRoles(roles: string[] = []): boolean {
  return roles.includes("site_admin") || roles.includes("manager");
}

export function canConfigureSite(roles: string[] = []): boolean {
  return roles.includes("site_admin") || roles.includes("manager");
}

export function canModerateUsers(roles: string[] = []): boolean {
  return roles.includes("site_admin") || roles.includes("manager");
}
