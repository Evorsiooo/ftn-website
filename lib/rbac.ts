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

export function canAssignRoles(roles: string[] = []): boolean {
  return roles.includes("site_admin") || roles.includes("manager");
}

export function canConfigureSite(roles: string[] = []): boolean {
  return roles.includes("site_admin") || roles.includes("manager");
}

export function canModerateUsers(roles: string[] = []): boolean {
  return roles.includes("site_admin") || roles.includes("manager");
}
