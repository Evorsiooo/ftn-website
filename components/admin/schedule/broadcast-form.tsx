"use client";
import { Select } from "@/components/ui/select";
import { DateTimeInput } from "@/components/ui/date-time-input";
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BroadcastRecord,
  DAYS,
  ShowRecord,
  TAGS,
  defaultTimezone,
  timezoneList,
  toWallInput,
  wallInputToUtc,
} from "@/lib/schedule-client";
import { labelClass, selectClass } from "./styles";

export interface FormPreset {
  start?: Date;
  end?: Date;
}

interface Props {
  shows: ShowRecord[];
  broadcast?: BroadcastRecord; // edit mode when given
  preset?: FormPreset;
  onSaved: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function BroadcastForm({ shows, broadcast, preset, onSaved, onCancel, onDelete }: Props) {
  const editing = !!broadcast;
  const [timezone, setTimezone] = useState(broadcast?.timezone ?? defaultTimezone());
  const defaultStart = preset?.start ?? new Date(Math.ceil(Date.now() / 3600000) * 3600000 + 3600000);
  const defaultEnd = preset?.end ?? new Date(defaultStart.getTime() + 2 * 3600000);
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  const [onRadio, setOnRadio] = useState(broadcast ? broadcast.onRadio : true);
  const [onStream, setOnStream] = useState(broadcast ? broadcast.onStream : false);
  const [showId, setShowId] = useState(broadcast?.showId ?? "");
  const [title, setTitle] = useState(broadcast?.title ?? "");
  const [description, setDescription] = useState(broadcast?.description ?? "");
  const [kind, setKind] = useState<"weekly" | "once">(broadcast?.kind ?? (preset ? "once" : "weekly"));
  const [tag, setTag] = useState(broadcast?.tag ?? "live");
  const [cancelled, setCancelled] = useState(broadcast?.status === "cancelled");
  const [youtube, setYoutube] = useState(broadcast?.youtubeId ?? "");
  const [day, setDay] = useState(broadcast?.dayOfWeek ?? defaultStart.getDay());
  const [time, setTime] = useState(broadcast?.startMinute != null ? hhmm(broadcast.startMinute) : toWallInput(defaultStart, timezone).slice(11));
  const [duration, setDuration] = useState(broadcast?.durationMinutes ?? 120);
  const [from, setFrom] = useState(toWallInput(broadcast?.startsAt ?? defaultStart, timezone));
  const [to, setTo] = useState(toWallInput(broadcast?.endsAt ?? defaultEnd, timezone));
  const [sportsEventId, setSportsEventId] = useState(broadcast?.sportsEventId ?? "");
  const [sportsEvents, setSportsEvents] = useState<{ id: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upcoming sports events this broadcast can cover; the sports pages show its badge on the event.
  useEffect(() => {
    fetch("/api/sports/data")
      .then((r) => r.json() as Promise<any>)
      .then((j) => {
        const leagues = new Map<string, string>((j.leagues ?? []).map((l: any) => [l.id, l.name]));
        const teams = new Map<string, string>((j.teams ?? []).map((t: any) => [t.id, t.name]));
        const list = (j.events ?? [])
          .filter((e: any) => e.status === "scheduled" || e.id === broadcast?.sportsEventId)
          .map((e: any) => ({
            id: e.id,
            label: `${leagues.get(e.leagueId) ?? "League"} · ${
              e.homeTeamId && e.awayTeamId ? `${teams.get(e.homeTeamId) ?? "?"} vs ${teams.get(e.awayTeamId) ?? "?"}` : `${e.round ? `Round ${e.round}: ` : ""}${e.name || "Race"}`
            } · ${new Date(e.startsAt).toLocaleDateString()}`,
          }));
        setSportsEvents(list);
      })
      .catch(() => {});
  }, [broadcast?.sportsEventId]);

  // Switching zone keeps a one-off at the same instant (its wall-clock fields are re-expressed);
  // weekly times keep their typed wall-clock values, which is what "set it in zone X" means.
  const changeTimezone = (next: string) => {
    if (kind === "once") {
      const s = wallInputToUtc(from, timezone);
      const en = wallInputToUtc(to, timezone);
      if (!isNaN(s.getTime()) && !isNaN(en.getTime())) {
        setFrom(toWallInput(s, next));
        setTo(toWallInput(en, next));
      }
    }
    setTimezone(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body: Record<string, unknown> = {
      onRadio,
      onStream,
      showId: showId || null,
      title,
      description,
      kind,
      tag,
      timezone,
      status: cancelled ? "cancelled" : "scheduled",
      youtubeId: onStream ? youtube : null,
      sportsEventId: sportsEventId || null,
    };
    if (kind === "weekly") {
      Object.assign(body, { dayOfWeek: day, startTime: time, durationMinutes: duration });
    } else {
      const s = wallInputToUtc(from, timezone);
      const en = wallInputToUtc(to, timezone);
      if (isNaN(s.getTime()) || isNaN(en.getTime())) {
        setError("Valid start and end times are required.");
        return;
      }
      Object.assign(body, { startsAt: s.toISOString(), endsAt: en.toISOString() });
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/admin/broadcasts/${broadcast!.id}` : "/api/admin/broadcasts", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const check = "flex items-center gap-2 text-xs font-semibold cursor-pointer";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <span className={labelClass}>Airs on</span>
        <div className="flex gap-5">
          <label className={check}>
            <input type="checkbox" checked={onRadio} onChange={(e) => setOnRadio(e.target.checked)} /> Radio
          </label>
          <label className={check}>
            <input type="checkbox" checked={onStream} onChange={(e) => setOnStream(e.target.checked)} /> Livestream
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Show {onRadio ? "" : "(optional)"}</label>
          <Select value={showId} onChange={(e) => setShowId(e.target.value)} className={selectClass}>
            <option value="">{onRadio ? "Choose a show…" : "No show"}</option>
            {shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.presenter}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className={labelClass}>Title {showId ? "(optional, replaces the show name)" : ""}</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Grand Prix live" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Description (optional)</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {sportsEvents.length > 0 && (
        <div>
          <label className={labelClass}>Sports event (optional)</label>
          <Select value={sportsEventId} onChange={(e) => setSportsEventId(e.target.value)} className={selectClass}>
            <option value="">None</option>
            {sportsEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </Select>
          <p className="text-[11px] text-neutral-500 mt-1">Links this broadcast to the event so FTN+ Sports shows a Livestream or Radio badge on it.</p>
        </div>
      )}

      {onStream && (
        <div>
          <label className={labelClass}>YouTube link (optional)</label>
          <Input
            value={youtube}
            onChange={(e) => setYoutube(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=… or the video id"
          />
          <p className="text-[11px] text-neutral-500 mt-1">
            Add it once the stream exists on YouTube so the schedule links to the FTN+ watch page.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Repeats</label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as any)} className={selectClass}>
            <option value="once">One-off</option>
            <option value="weekly">Weekly</option>
          </Select>
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <Select value={tag} onChange={(e) => setTag(e.target.value as any)} className={selectClass}>
            {TAGS.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {kind === "weekly" ? (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Day</label>
            <Select value={day} onChange={(e) => setDay(Number(e.target.value))} className={selectClass}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className={labelClass}>Start</label>
            <DateTimeInput type="time" value={time} onChange={(e) => setTime(e.target.value)} className={selectClass} />
          </div>
          <div>
            <label className={labelClass}>Minutes</label>
            <input
              type="number"
              min={5}
              max={1440}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={selectClass}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Starts</label>
            <DateTimeInput type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass} />
          </div>
          <div>
            <label className={labelClass}>Ends</label>
            <DateTimeInput type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className={selectClass} />
          </div>
        </div>
      )}
      <div>
        <label className={labelClass}>Timezone</label>
        <Select value={timezone} onChange={(e) => changeTimezone(e.target.value)} className={selectClass}>
          {timezoneList([timezone, defaultTimezone()]).map((z) => (
            <option key={z} value={z}>
              {z}
              {z === defaultTimezone() ? " (yours)" : ""}
            </option>
          ))}
        </Select>
        <p className="text-[11px] text-neutral-500 mt-1">
          {kind === "weekly"
            ? "Weekly shows keep this local time all year: if the zone changes between summer and winter time, the show stays at the same wall-clock time."
            : "The start and end above are read in this zone."}
        </p>
      </div>

      {editing && (
        <label className={check}>
          <input type="checkbox" checked={cancelled} onChange={(e) => setCancelled(e.target.checked)} /> Cancelled (stays on the
          schedule, marked as cancelled)
        </label>
      )}

      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={saving} className="text-xs cursor-pointer">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
          {editing ? "Save changes" : "Add to schedule"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} className="text-xs cursor-pointer">
          Cancel
        </Button>
        {editing && onDelete && (
          <Button type="button" size="sm" variant="outline" onClick={onDelete} className="text-xs text-red-600 cursor-pointer ml-auto">
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
