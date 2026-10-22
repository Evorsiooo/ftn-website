// ---------------------------------------------------------------------------
// Unified broadcast schedule: radio shows and livestreams (everything is UTC).
// Pure logic only, so it is safe to import from client components.
// ---------------------------------------------------------------------------

export type BroadcastTag = "live" | "simulcast" | "rebroadcast";
export type BroadcastStatus = "scheduled" | "cancelled";

export interface ShowRecord {
  id: string;
  name: string;
  presenter: string;
  description: string | null;
  artUrl: string | null;
}

export interface BroadcastRecord {
  id: string;
  showId: string | null;
  title: string | null;
  description: string | null;
  onRadio: boolean;
  onStream: boolean;
  kind: "weekly" | "once";
  tag: BroadcastTag;
  status: BroadcastStatus;
  dayOfWeek: number | null;
  startMinute: number | null;
  durationMinutes: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  youtubeId: string | null;
  sportsEventId: string | null;
}

export interface Occurrence {
  broadcastId: string;
  title: string;
  presenter: string | null;
  description: string | null;
  artUrl: string | null;
  onRadio: boolean;
  onStream: boolean;
  tag: BroadcastTag;
  status: BroadcastStatus;
  recurring: boolean;
  youtubeId: string | null;
  sportsEventId: string | null;
  start: Date;
  end: Date;
  show: ShowRecord | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function broadcastTitle(b: BroadcastRecord, show: ShowRecord | null): string {
  return b.title?.trim() || show?.name || "Untitled broadcast";
}

// Expand broadcasts into concrete airings between [from, to]. Cancelled one-offs are
// kept (flagged) so the schedule can show them; pass includeCancelled=false to drop them.
export function expandOccurrences(
  shows: ShowRecord[],
  list: BroadcastRecord[],
  from: Date,
  to: Date,
  includeCancelled = true
): Occurrence[] {
  const showById = new Map(shows.map((s) => [s.id, s]));
  const out: Occurrence[] = [];

  for (const b of list) {
    if (!includeCancelled && b.status === "cancelled") continue;
    const show = b.showId ? showById.get(b.showId) ?? null : null;
    if (b.onRadio && !show) continue; // radio entries need their show

    const make = (start: Date, end: Date): Occurrence => ({
      broadcastId: b.id,
      title: broadcastTitle(b, show),
      presenter: show?.presenter ?? null,
      description: b.description ?? show?.description ?? null,
      artUrl: show?.artUrl ?? null,
      onRadio: b.onRadio,
      onStream: b.onStream,
      tag: b.tag,
      status: b.status,
      recurring: b.kind === "weekly",
      youtubeId: b.youtubeId,
      sportsEventId: b.sportsEventId,
      start,
      end,
      show,
    });

    if (b.kind === "once") {
      if (!b.startsAt || !b.endsAt) continue;
      if (b.endsAt >= from && b.startsAt <= to) out.push(make(b.startsAt, b.endsAt));
      continue;
    }

    if (b.dayOfWeek === null || b.startMinute === null || !b.durationMinutes) continue;
    // Start one day early so overnight entries that began yesterday are still found.
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) - DAY_MS);
    for (let t = cursor.getTime(); t <= to.getTime(); t += DAY_MS) {
      if (new Date(t).getUTCDay() !== b.dayOfWeek) continue;
      const start = new Date(t + b.startMinute * 60 * 1000);
      const end = new Date(start.getTime() + b.durationMinutes * 60 * 1000);
      if (end >= from && start <= to) out.push(make(start, end));
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function resolveCurrentAndNext(
  shows: ShowRecord[],
  list: BroadcastRecord[],
  now: Date = new Date()
): { current: Occurrence | null; next: Occurrence | null } {
  const upcoming = expandOccurrences(
    shows,
    list.filter((b) => b.onRadio),
    now,
    new Date(now.getTime() + 8 * DAY_MS),
    false
  );
  const current = upcoming.find((o) => o.start <= now && o.end > now) || null;
  const next = upcoming.find((o) => o.start > now) || null;
  return { current, next };
}

// Radio has a single transmitter, so two radio airings may not overlap.
// Checks `candidate` against the other radio broadcasts over the next `horizonDays`.
export function findRadioConflict(
  shows: ShowRecord[],
  others: BroadcastRecord[],
  candidate: BroadcastRecord,
  now: Date = new Date(),
  horizonDays = 60
): { with: Occurrence; at: Occurrence } | null {
  if (!candidate.onRadio || candidate.status === "cancelled") return null;
  const from = candidate.kind === "once" && candidate.startsAt ? new Date(candidate.startsAt.getTime() - DAY_MS) : now;
  const to = candidate.kind === "once" && candidate.endsAt ? new Date(candidate.endsAt.getTime() + DAY_MS) : new Date(now.getTime() + horizonDays * DAY_MS);
  const mine = expandOccurrences(shows, [candidate], from, to, false);
  const theirs = expandOccurrences(
    shows,
    others.filter((o) => o.id !== candidate.id && o.onRadio),
    from,
    to,
    false
  );
  for (const a of mine) {
    for (const t of theirs) {
      if (a.start < t.end && t.start < a.end) return { with: t, at: a };
    }
  }
  return null;
}

export function serializeOccurrence(o: Occurrence) {
  return {
    id: `${o.broadcastId}:${o.start.getTime()}`,
    broadcastId: o.broadcastId,
    title: o.title,
    presenter: o.presenter,
    description: o.description,
    artUrl: o.artUrl,
    onRadio: o.onRadio,
    onStream: o.onStream,
    tag: o.tag,
    status: o.status,
    recurring: o.recurring,
    youtubeId: o.youtubeId,
    sportsEventId: o.sportsEventId,
    start: o.start.toISOString(),
    end: o.end.toISOString(),
  };
}
