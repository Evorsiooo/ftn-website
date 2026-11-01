// The root administrator is identified by Roblox user id, which never changes. Usernames can be
// changed or released and then taken by someone else, so they must not grant anything.
const ROOT_ROBLOX_IDS = new Set(["242304445"]);

export function isRootAdmin(robloxId: string | null | undefined): boolean {
  return !!robloxId && ROOT_ROBLOX_IDS.has(String(robloxId));
}
