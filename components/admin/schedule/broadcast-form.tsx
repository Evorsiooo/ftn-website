"use client";
import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BroadcastRecord,
  DAYS,
  ShowRecord,
  TAGS,
  localZone,
  toLocalInput,
  weeklyLocalToUtc,
  weeklyUtcToLocal,
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
  const weeklyLocal =
    broadcast?.kind === "weekly" && broadcast.dayOfWeek !== null && broadcast.startMinute !== null
      ? weeklyUtcToLocal(broadcast.dayOfWeek, broadcast.startMinute)
      : null;
  const defaultStart = preset?.start ?? new Date(Math.ceil(Date.now() / 3600000) * 3600000 + 3600000);
  const defaultEnd = preset?.end ?? new Date(defaultStart.getTime() + 2 * 3600000);

  const [onRadio, setOnRadio] = useState(broadcast ? broadcast.onRadio : true);
  const [onStream, setOnStream] = useState(broadcast ? broadcast.onStream : false);
  const [showId, setShowId] = useState(broadcast?.showId ?? "");
  const [title, setTitle] = useState(broadcast?.title ?? "");
  const [description, setDescription] = useState(broadcast?.description ?? "");
  const [kind, setKind] = useState<"weekly" | "once">(broadcast?.kind ?? (preset ? "once" : "weekly"));
  const [tag, setTag] = useState(broadcast?.tag ?? "live");
  const [cancelled, setCancelled] = useState(broadcast?.status === "cancelled");
  const [youtube, setYoutube] = useState(broadcast?.youtubeId ?? "");
  const [day, setDay] = useState(weeklyLocal?.day ?? defaultStart.getDay());
  const [time, setTime] = useState(weeklyLocal?.time ?? toLocalInput(defaultStart).slice(11));
  const [duration, setDuration] = useState(broadcast?.durationMinutes ?? 120);
  const [from, setFrom] = useState(toLocalInput(broadcast?.startsAt ?? defaultStart));
  const [to, setTo] = useState(toLocalInput(broadcast?.endsAt ?? defaultEnd));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      status: cancelled ? "cancelled" : "scheduled",
      youtubeId: onStream ? youtube : null,
    };
    if (kind === "weekly") {
      Object.assign(body, weeklyLocalToUtc(day, time), { durationMinutes: duration });
    } else {
      const s = new Date(from);
      const en = new Date(to);
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
            <input type="checkbox" checked={onStream} onChange={(e) => setOnStream(e.target.checked)} /> Livestream (YouTube)
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Show {onRadio ? "" : "(optional)"}</label>
          <select value={showId} onChange={(e) => setShowId(e.target.value)} className={selectClass}>
            <option value="">{onRadio ? "Choose a show…" : "No show"}</option>
            {shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.presenter}
              </option>
            ))}
          </select>
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
          <select value={kind} onChange={(e) => setKind(e.target.value as any)} className={selectClass}>
            <option value="once">One-off</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select value={tag} onChange={(e) => setTag(e.target.value as any)} className={selectClass}>
            {TAGS.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {kind === "weekly" ? (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Day</label>
            <select value={day} onChange={(e) => setDay(Number(e.target.value))} className={selectClass}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Start</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={selectClass} />
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
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass} />
          </div>
          <div>
            <label className={labelClass}>Ends</label>
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className={selectClass} />
          </div>
        </div>
      )}
      <p className="text-[11px] text-neutral-500">Times are in your local time ({localZone()}).</p>

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
