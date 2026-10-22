import type { SlotTag } from "@/lib/radio";

export interface ShowInput {
  name?: string;
  presenter?: string;
  description?: string | null;
  artUrl?: string | null;
}

export function validateShowInput(
  body: ShowInput,
  requireAll: boolean
): { values: Record<string, unknown> } | { error: string } {
  const values: Record<string, unknown> = {};

  if (body.name !== undefined || requireAll) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "Show name is required." };
    values.name = name.slice(0, 120);
  }
  if (body.presenter !== undefined || requireAll) {
    const presenter = typeof body.presenter === "string" ? body.presenter.trim() : "";
    if (!presenter) return { error: "Presenter / DJ is required." };
    values.presenter = presenter.slice(0, 120);
  }
  if (body.description !== undefined) {
    values.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 1000)
        : null;
  }
  if (body.artUrl !== undefined) {
    if (body.artUrl === null || body.artUrl === "") {
      values.artUrl = null;
    } else if (typeof body.artUrl === "string" && body.artUrl.startsWith("/api/media/radio/")) {
      values.artUrl = body.artUrl;
    } else {
      return { error: "Album art must be uploaded through the radio uploader." };
    }
  }
  return { values };
}

export interface SlotInput {
  kind?: string;
  tag?: string;
  dayOfWeek?: number;
  startTime?: string; // "HH:MM" UTC
  durationMinutes?: number;
  startsAt?: string; // ISO
  endsAt?: string; // ISO
}

const TAGS: SlotTag[] = ["live", "simulcast", "rebroadcast"];

export function validateSlotInput(
  body: SlotInput
):
  | {
      values: {
        kind: "weekly" | "once";
        tag: SlotTag;
        dayOfWeek: number | null;
        startMinute: number | null;
        durationMinutes: number | null;
        startsAt: Date | null;
        endsAt: Date | null;
      };
    }
  | { error: string } {
  const tag = (TAGS as string[]).includes(body.tag || "") ? (body.tag as SlotTag) : "live";

  if (body.kind === "once") {
    const startsAt = new Date(body.startsAt || "");
    const endsAt = new Date(body.endsAt || "");
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) return { error: "Valid start and end times are required." };
    if (endsAt <= startsAt) return { error: "End must be after start." };
    if (endsAt.getTime() - startsAt.getTime() > 24 * 60 * 60 * 1000) return { error: "A slot can last at most 24 hours." };
    return { values: { kind: "once", tag, dayOfWeek: null, startMinute: null, durationMinutes: null, startsAt, endsAt } };
  }

  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(body.startTime || "");
  if (!match) return { error: "Start time must be HH:MM (UTC)." };
  const day = Number(body.dayOfWeek);
  if (!Number.isInteger(day) || day < 0 || day > 6) return { error: "Day of week must be 0 (Sunday) to 6 (Saturday)." };
  const duration = Number(body.durationMinutes);
  if (!Number.isInteger(duration) || duration < 5 || duration > 24 * 60) {
    return { error: "Duration must be between 5 minutes and 24 hours." };
  }
  return {
    values: {
      kind: "weekly",
      tag,
      dayOfWeek: day,
      startMinute: Number(match[1]) * 60 + Number(match[2]),
      durationMinutes: duration,
      startsAt: null,
      endsAt: null,
    },
  };
}
