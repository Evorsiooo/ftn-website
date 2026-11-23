import { DbClient } from "@/db";
import { eq } from "drizzle-orm";
import { radioShows, broadcasts, radioVersions } from "@/db/schema";
import type { BroadcastRecord, ShowRecord } from "@/lib/schedule-core";

export * from "@/lib/schedule-core";

export function parseRoStates(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

type ShowsAndBroadcasts = { shows: ShowRecord[]; broadcasts: BroadcastRecord[] };

// The last schedule this server instance read, and the "schedule" counter in radio_versions it was read at.
// Database triggers move the counter on every change to radio_shows or broadcasts (migration 0034).
let memo: { version: number; value: ShowsAndBroadcasts } | null = null;

/**
 * Every show and broadcast. Asked for by the every-minute cron, the now-playing poll and FTN+, so while the
 * schedule hasn't changed it costs one row (the counter) instead of every show and broadcast.
 */
export async function loadShowsAndBroadcasts(db: DbClient): Promise<ShowsAndBroadcasts> {
  const [v] = await db
    .select({ version: radioVersions.version })
    .from(radioVersions)
    .where(eq(radioVersions.name, "schedule"))
    .catch(() => [] as { version: number }[]);
  if (v && memo && memo.version === v.version) return structuredClone(memo.value);
  const value = await readShowsAndBroadcasts(db);
  memo = v ? { version: v.version, value: structuredClone(value) } : null;
  return value;
}

async function readShowsAndBroadcasts(db: DbClient): Promise<ShowsAndBroadcasts> {
  const showRows = await db.select().from(radioShows);
  const rows = await db.select().from(broadcasts);
  return {
    shows: showRows.map((s) => ({
      id: s.id,
      name: s.name,
      presenter: s.presenter,
      description: s.description ?? null,
      artUrl: s.artUrl ?? null,
    })),
    broadcasts: rows.map((b) => ({
      id: b.id,
      showId: b.showId ?? null,
      title: b.title ?? null,
      description: b.description ?? null,
      presenter: b.presenter ?? null,
      artUrl: b.artUrl ?? null,
      onRadio: b.onRadio,
      onStream: b.onStream,
      kind: b.kind,
      tag: b.tag,
      status: b.status,
      timezone: b.timezone,
      dayOfWeek: b.dayOfWeek ?? null,
      startMinute: b.startMinute ?? null,
      durationMinutes: b.durationMinutes ?? null,
      startsAt: b.startsAt ?? null,
      endsAt: b.endsAt ?? null,
      youtubeId: b.youtubeId ?? null,
      sportsEventId: b.sportsEventId ?? null,
      notify: b.notify,
      notifyMessage: b.notifyMessage ?? null,
      notifyRoStates: parseRoStates(b.notifyRoStates),
      plays: b.plays ?? "hosted",
      playlistId: b.playlistId ?? null,
      streamUrl: b.streamUrl ?? null,
    })),
  };
}
