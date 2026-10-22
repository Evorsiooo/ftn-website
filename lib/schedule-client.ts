import { utcToWall, wallToUtc } from "@/lib/schedule-core";
import type { BroadcastRecord, BroadcastTag, ShowRecord } from "@/lib/schedule-core";

// Client-side helpers for the admin schedule and the public schedule page.
// Instants are shown in the viewer's local time; weekly entries also carry their own timezone.

export interface ApiBroadcast extends Omit<BroadcastRecord, "startsAt" | "endsAt"> {
  startsAt: string | null;
  endsAt: string | null;
}

export function parseBroadcast(b: ApiBroadcast): BroadcastRecord {
  return { ...b, startsAt: b.startsAt ? new Date(b.startsAt) : null, endsAt: b.endsAt ? new Date(b.endsAt) : null };
}

export type { BroadcastRecord, BroadcastTag, ShowRecord };

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const TAGS: BroadcastTag[] = ["live", "simulcast", "rebroadcast"];

export const localZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
};

const pad = (n: number) => String(n).padStart(2, "0");

export function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// <input type="datetime-local"> value for a Date, in local time.
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hhmm(d)}`;
}

// Weekly entries are stored as a wall-clock day and time in an IANA timezone. The admin
// form defaults to the browser's zone and offers a dropdown to pick another one.
export function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const FALLBACK_ZONES = [
  "UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Moscow",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo",
  "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney", "Pacific/Auckland",
];

export function timezoneList(include: string[] = []): string[] {
  let zones: string[] = FALLBACK_ZONES;
  try {
    const supported = (Intl as any).supportedValuesOf?.("timeZone") as string[] | undefined;
    if (supported?.length) zones = supported.includes("UTC") ? supported : ["UTC", ...supported];
  } catch {
    /* use fallback */
  }
  return Array.from(new Set([...include, ...zones]));
}

// "YYYY-MM-DDTHH:MM" (datetime-local) <-> instant, interpreted in the given zone.
export function toWallInput(instant: Date, tz: string): string {
  const w = utcToWall(instant, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

export function wallInputToUtc(value: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return new Date(NaN);
  return wallToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]) * 60 + Number(m[5]), tz);
}

export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7)); // Monday
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
export const fmtDay = (d: Date) => dayFmt.format(d);
export const fmtTime = (d: Date) => timeFmt.format(d);
export const fmtRange = (s: Date, e: Date) => `${fmtTime(s)} – ${fmtTime(e)}`;

export function describeWhen(b: BroadcastRecord): string {
  if (b.kind === "once" && b.startsAt && b.endsAt) {
    return `${fmtDay(b.startsAt)}, ${fmtRange(b.startsAt, b.endsAt)}`;
  }
  if (b.dayOfWeek === null || b.startMinute === null || !b.durationMinutes) return "—";
  const end = (b.startMinute + b.durationMinutes) % (24 * 60);
  const t = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  return `${DAYS[b.dayOfWeek]}s ${t(b.startMinute)} – ${t(end)} (${b.timezone})`;
}

export function mediumLabel(b: { onRadio: boolean; onStream: boolean }): string {
  return b.onRadio && b.onStream ? "Radio + Stream" : b.onStream ? "Stream" : "Radio";
}

// Colour per medium, shared by the admin calendar and the public page.
export function mediumClasses(o: { onRadio: boolean; onStream: boolean }): string {
  if (o.onRadio && o.onStream) return "bg-teal-600/90 border-teal-300 text-white";
  if (o.onStream) return "bg-purple-600/90 border-purple-300 text-white";
  return "bg-blue-600/90 border-blue-300 text-white";
}

export function youtubeThumb(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
