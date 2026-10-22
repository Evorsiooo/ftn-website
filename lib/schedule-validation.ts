import { isValidTimezone, type BroadcastTag, type BroadcastStatus } from "@/lib/schedule-core";

export interface BroadcastInput {
  showId?: string | null;
  title?: string | null;
  description?: string | null;
  onRadio?: boolean;
  onStream?: boolean;
  kind?: string;
  tag?: string;
  status?: string;
  timezone?: string; // IANA zone for weekly wall-clock times
  dayOfWeek?: number; // 0=Sunday, in `timezone`
  startTime?: string; // "HH:MM" in `timezone`
  durationMinutes?: number;
  startsAt?: string; // ISO
  endsAt?: string; // ISO
  youtubeId?: string | null;
  sportsEventId?: string | null;
}

export interface BroadcastValues {
  showId: string | null;
  title: string | null;
  description: string | null;
  onRadio: boolean;
  onStream: boolean;
  kind: "weekly" | "once";
  tag: BroadcastTag;
  status: BroadcastStatus;
  timezone: string;
  dayOfWeek: number | null;
  startMinute: number | null;
  durationMinutes: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  youtubeId: string | null;
  sportsEventId: string | null;
}

const TAGS: BroadcastTag[] = ["live", "simulcast", "rebroadcast"];
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

// Accepts a bare 11-character id or any common YouTube URL; returns null when empty.
export function parseYoutubeId(value: unknown): string | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (YOUTUBE_ID.test(v)) return v;
  const m = v.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|live\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return m ? m[1] : undefined;
}

// Validates a full broadcast (create) — every field is resolved.
export function validateBroadcastInput(body: BroadcastInput): { values: BroadcastValues } | { error: string } {
  const onRadio = body.onRadio === true;
  const onStream = body.onStream === true;
  if (!onRadio && !onStream) return { error: "Choose radio, livestream, or both." };

  const showId = typeof body.showId === "string" && body.showId ? body.showId : null;
  if (onRadio && !showId) return { error: "Radio broadcasts need a show." };

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 160) : null;
  if (!showId && !title) return { error: "Livestreams without a show need a title." };

  const description =
    typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 1000) : null;

  const tag = (TAGS as string[]).includes(body.tag || "") ? (body.tag as BroadcastTag) : "live";
  const status: BroadcastStatus = body.status === "cancelled" ? "cancelled" : "scheduled";

  const youtubeId = parseYoutubeId(body.youtubeId);
  if (youtubeId === undefined) return { error: "That does not look like a YouTube link or video id." };
  const sportsEventId = typeof body.sportsEventId === "string" && body.sportsEventId ? body.sportsEventId : null;

  const timezone = body.timezone === undefined || body.timezone === "" ? "UTC" : body.timezone;
  if (!isValidTimezone(timezone)) return { error: "Unknown timezone." };

  const common = { timezone, showId, title, description, onRadio, onStream, tag, status, youtubeId, sportsEventId };

  if (body.kind === "once") {
    const startsAt = new Date(body.startsAt || "");
    const endsAt = new Date(body.endsAt || "");
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) return { error: "Valid start and end times are required." };
    if (endsAt <= startsAt) return { error: "End must be after start." };
    if (endsAt.getTime() - startsAt.getTime() > 24 * 60 * 60 * 1000) return { error: "A broadcast can last at most 24 hours." };
    return {
      values: { ...common, kind: "once", dayOfWeek: null, startMinute: null, durationMinutes: null, startsAt, endsAt },
    };
  }

  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(body.startTime || "");
  if (!match) return { error: "Start time must be HH:MM." };
  const day = Number(body.dayOfWeek);
  if (!Number.isInteger(day) || day < 0 || day > 6) return { error: "Day of week must be 0 (Sunday) to 6 (Saturday)." };
  const duration = Number(body.durationMinutes);
  if (!Number.isInteger(duration) || duration < 5 || duration > 24 * 60) {
    return { error: "Duration must be between 5 minutes and 24 hours." };
  }
  return {
    values: {
      ...common,
      kind: "weekly",
      dayOfWeek: day,
      startMinute: Number(match[1]) * 60 + Number(match[2]),
      durationMinutes: duration,
      startsAt: null,
      endsAt: null,
    },
  };
}

export const BULK_ACTIONS = ["delete", "cancel", "restore", "shift", "setTag"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export function validateBulk(body: any): { ids: string[]; action: BulkAction; minutes?: number; tag?: BroadcastTag } | { error: string } {
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) return { error: "Select at least one broadcast." };
  if (ids.length > 200) return { error: "Too many broadcasts selected." };
  if (!(BULK_ACTIONS as readonly string[]).includes(body?.action)) return { error: "Unknown action." };
  if (body.action === "shift") {
    const minutes = Number(body.minutes);
    if (!Number.isInteger(minutes) || minutes === 0 || Math.abs(minutes) > 7 * 24 * 60) {
      return { error: "Shift must be a non-zero number of minutes, at most 7 days." };
    }
    return { ids, action: "shift", minutes };
  }
  if (body.action === "setTag") {
    if (!(TAGS as string[]).includes(body.tag)) return { error: "Unknown tag." };
    return { ids, action: "setTag", tag: body.tag };
  }
  return { ids, action: body.action };
}
