import type { BroadcastRecord, BroadcastTag, ShowRecord } from "@/lib/schedule-core";

// Client-side helpers for the admin schedule and the public schedule page.
// Storage and the API are UTC; everything the person sees or types is their local time.

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

// Weekly entries are stored as UTC day + minute. These convert using the next upcoming
// occurrence, so the local time shown is correct for the current daylight-saving period.
export function weeklyLocalToUtc(localDay: number, time: string): { dayOfWeek: number; startTime: string } {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  d.setDate(d.getDate() + ((localDay - d.getDay() + 7) % 7));
  return { dayOfWeek: d.getUTCDay(), startTime: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
}

export function weeklyUtcToLocal(dayOfWeek: number, startMinute: number): { day: number; time: string } {
  const d = new Date();
  d.setUTCHours(Math.floor(startMinute / 60), startMinute % 60, 0, 0);
  d.setUTCDate(d.getUTCDate() + ((dayOfWeek - d.getUTCDay() + 7) % 7));
  return { day: d.getDay(), time: hhmm(d) };
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
  const { day, time } = weeklyUtcToLocal(b.dayOfWeek, b.startMinute);
  const [h, m] = time.split(":").map(Number);
  const end = new Date(2000, 0, 1, h, m + b.durationMinutes);
  return `${DAYS[day]}s ${time} – ${hhmm(end)}`;
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
