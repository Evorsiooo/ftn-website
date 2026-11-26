// A song's place in the library (Getting ready, On air, Needs a look). Shared by the Library page and the MCP
// tools, so it lives outside the "use client" Prepare module.
export type SongStatus = "archived" | "on-air" | "getting-ready" | "missing" | "failed";

export function songStatus(s: { archived?: boolean | null; analysedAt?: unknown; metaCheckedAt?: unknown; prepError?: string | null }): SongStatus {
  if (s.archived) return "archived";
  if (s.prepError === "missing") return "missing";
  if (s.prepError === "failed") return "failed";
  return s.analysedAt && s.metaCheckedAt ? "on-air" : "getting-ready";
}
