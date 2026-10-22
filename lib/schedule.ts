import { DbClient } from "@/db";
import { radioShows, broadcasts } from "@/db/schema";
import type { BroadcastRecord, ShowRecord } from "@/lib/schedule-core";

export * from "@/lib/schedule-core";

export async function loadShowsAndBroadcasts(
  db: DbClient
): Promise<{ shows: ShowRecord[]; broadcasts: BroadcastRecord[] }> {
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
      onRadio: b.onRadio,
      onStream: b.onStream,
      kind: b.kind,
      tag: b.tag,
      status: b.status,
      dayOfWeek: b.dayOfWeek ?? null,
      startMinute: b.startMinute ?? null,
      durationMinutes: b.durationMinutes ?? null,
      startsAt: b.startsAt ?? null,
      endsAt: b.endsAt ?? null,
      youtubeId: b.youtubeId ?? null,
      sportsEventId: b.sportsEventId ?? null,
    })),
  };
}
