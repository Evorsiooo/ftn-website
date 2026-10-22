import { DbClient } from "@/db";
import { broadcasts } from "@/db/schema";
import { BroadcastRecord, ShowRecord, findRadioConflict } from "@/lib/schedule-core";
import { BroadcastInput, BroadcastValues } from "@/lib/schedule-validation";

const pad = (n: number) => String(n).padStart(2, "0");

export function recordToInput(b: BroadcastRecord): BroadcastInput {
  return {
    showId: b.showId,
    title: b.title,
    description: b.description,
    onRadio: b.onRadio,
    onStream: b.onStream,
    kind: b.kind,
    tag: b.tag,
    status: b.status,
    timezone: b.timezone,
    dayOfWeek: b.dayOfWeek ?? undefined,
    startTime: b.startMinute !== null ? `${pad(Math.floor(b.startMinute / 60))}:${pad(b.startMinute % 60)}` : undefined,
    durationMinutes: b.durationMinutes ?? undefined,
    startsAt: b.startsAt?.toISOString(),
    endsAt: b.endsAt?.toISOString(),
    youtubeId: b.youtubeId,
    sportsEventId: b.sportsEventId,
  };
}

export function valuesToRecord(id: string, v: BroadcastValues): BroadcastRecord {
  return { id, ...v };
}

export function serializeBroadcast(b: BroadcastRecord) {
  return { ...b, startsAt: b.startsAt?.toISOString() ?? null, endsAt: b.endsAt?.toISOString() ?? null };
}

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";

// Returns a human-readable message when `candidate` overlaps another radio airing.
export function radioConflictMessage(
  shows: ShowRecord[],
  others: BroadcastRecord[],
  candidate: BroadcastRecord
): string | null {
  const c = findRadioConflict(shows, others, candidate);
  if (!c) return null;
  return `Radio overlap: "${c.with.title}" is already on air ${fmt(c.with.start)} to ${fmt(c.with.end)}.`;
}

export async function insertBroadcast(db: DbClient, id: string, v: BroadcastValues) {
  await db.insert(broadcasts).values({ id, ...v });
}
