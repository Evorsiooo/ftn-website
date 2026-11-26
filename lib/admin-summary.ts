import { expandOccurrences } from "@/lib/schedule-core";
import type { Occurrence } from "@/lib/schedule-core";
import { parseBroadcast } from "@/lib/schedule-client";
import type { ApiBroadcast } from "@/lib/schedule-client";

// What needs a staff member's attention, from GET /api/admin/summary.
// Each part is null when the role cannot see it or the request failed.
export interface AdminSummary {
  tips: { unread: number; oldestDays: number } | null;
  posts: { pending: number } | null;
  drafts: { count: number; stale: number } | null;
  onAir: { current: Occurrence | null; upcoming: Occurrence[] } | null;
  adsLow: { id: string; title: string; organizer: string; left: number }[] | null;
  /** Song imports: how many songs wait for someone to pick the right match, and imports still running. */
  imports: { review: number; running: number } | null;
  /** Radio problem reports nobody has looked at yet. */
  reports: { new: number } | null;
}

const TTL_MS = 30000;
const DAY = 24 * 60 * 60 * 1000;
let cache: { key: string; at: number; value: Promise<AdminSummary> } | null = null;

// One small request (GET /api/admin/summary, indexed counts only). It replaced seven whole-list requests
// (every tip, post, article, broadcast, ad, organizer and import) made by every admin tab once a minute.
async function load(_roles: string[]): Promise<AdminSummary> {
  let data: any = null;
  try {
    const res = await fetch("/api/admin/summary");
    data = res.ok ? await res.json() : null;
  } catch {
    data = null;
  }
  const now = Date.now();

  let onAir: AdminSummary["onAir"] = null;
  const sched = data?.schedule;
  if (sched && Array.isArray(sched.shows) && Array.isArray(sched.broadcasts)) {
    const list = (sched.broadcasts as ApiBroadcast[]).map(parseBroadcast);
    const occ = expandOccurrences(sched.shows, list, new Date(now), new Date(now + 8 * DAY), false);
    onAir = {
      current: occ.find((o) => o.start.getTime() <= now && o.end.getTime() > now) ?? null,
      upcoming: occ.filter((o) => o.start.getTime() > now).slice(0, 3),
    };
  }

  return {
    tips: data?.tips ?? null,
    posts: data?.posts ?? null,
    drafts: data?.drafts ?? null,
    onAir,
    adsLow: Array.isArray(data?.adsLow) ? data.adsLow : null,
    imports: data?.imports ?? null,
    reports: data?.reports ?? null,
  };
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
