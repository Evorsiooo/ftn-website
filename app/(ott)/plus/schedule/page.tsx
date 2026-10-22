"use client";
export const runtime = "edge";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconRadio, IconBroadcast, IconPlayerPlay, IconHeadphones } from "@tabler/icons-react";
import { useSiteConfig } from "@/lib/site-config-context";
import { addDays, fmtRange, fmtTime, localZone, youtubeThumb } from "@/lib/schedule-client";

interface Entry {
  id: string;
  broadcastId: string;
  title: string;
  presenter: string | null;
  description: string | null;
  artUrl: string | null;
  onRadio: boolean;
  onStream: boolean;
  tag: "live" | "simulcast" | "rebroadcast";
  status: "scheduled" | "cancelled";
  youtubeId: string | null;
  start: string;
  end: string;
}

type Medium = "all" | "radio" | "stream";

const DAYS_SHOWN = 14;
const dayName = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const dayLong = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function thumb(e: Entry): string | null {
  return e.artUrl || (e.onStream && e.youtubeId ? youtubeThumb(e.youtubeId) : null);
}

function Actions({ entry, radioEnabled }: { entry: Entry; radioEnabled: boolean }) {
  const btn =
    "inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-xs font-bold transition cursor-pointer";
  return (
    <div className="flex flex-wrap gap-2">
      {entry.onStream && entry.youtubeId && (
        <Link href={`/plus/watch/${entry.youtubeId}`} className={`${btn} bg-brand text-black hover:bg-brand-hover`}>
          <IconPlayerPlay className="h-3.5 w-3.5" /> Watch
        </Link>
      )}
      {entry.onRadio && radioEnabled && (
        <Link href="/plus/radio" className={`${btn} border border-neutral-700 text-neutral-200 hover:bg-neutral-800`}>
          <IconHeadphones className="h-3.5 w-3.5" /> Listen
        </Link>
      )}
    </div>
  );
}

function MediumIcons({ entry }: { entry: Entry }) {
  return (
    <span className="inline-flex items-center gap-1 text-neutral-400">
      {entry.onRadio && <IconRadio className="h-3.5 w-3.5" aria-label="Radio" />}
      {entry.onStream && <IconBroadcast className="h-3.5 w-3.5" aria-label="Livestream" />}
    </span>
  );
}

export default function FTNPlusSchedulePage() {
  const { webradioEnabled } = useSiteConfig();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [medium, setMedium] = useState<Medium>("all");
  const [dayIndex, setDayIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const from = startOfToday();
    const to = addDays(from, DAYS_SHOWN);
    fetch(`/api/schedule?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((res) => res.json())
      .then((data: any) => setEntries(Array.isArray(data?.schedule) ? data.schedule : []))
      .catch(() => setEntries([]));
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);

  const days = useMemo(() => {
    const today = startOfToday();
    return Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i));
  }, []);

  const visible = useMemo(
    () =>
      (entries || []).filter((e) => (medium === "radio" ? e.onRadio : medium === "stream" ? e.onStream : true)),
    [entries, medium]
  );

  const onNow = visible.filter(
    (e) => e.status !== "cancelled" && new Date(e.start).getTime() <= now && new Date(e.end).getTime() > now
  );
  const upNext = visible.find((e) => e.status !== "cancelled" && new Date(e.start).getTime() > now);

  const day = days[dayIndex];
  const dayStart = day.getTime();
  const dayEnd = addDays(day, 1).getTime();
  const dayEntries = visible.filter((e) => {
    const s = new Date(e.start).getTime();
    return s >= dayStart && s < dayEnd;
  });

  const counts = useMemo(() => {
    return days.map((d) => {
      const s = d.getTime();
      const en = addDays(d, 1).getTime();
      return visible.filter((e) => {
        const t = new Date(e.start).getTime();
        return t >= s && t < en;
      }).length;
    });
  }, [days, visible]);

  const chip = (active: boolean) =>
    `rounded-full px-4 h-9 text-xs font-bold border transition cursor-pointer ${
      active ? "bg-white text-black border-white" : "bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-600"
    }`;

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-16">
      <div className="px-6 md:px-12 pt-24 pb-6 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand">FTN+</div>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight">Schedule</h1>
        <p className="text-sm text-neutral-400">Everything coming up on FTN Radio and the livestreams. Times are in your local time ({localZone()}).</p>
      </div>

      {onNow.length > 0 && (
        <div className="px-6 md:px-12 pb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-red-400 mb-3">On now</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {onNow.map((e) => (
              <div key={e.id} className="flex items-center gap-4 rounded-xl border border-red-900/60 bg-neutral-900 p-4">
                <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-800">
                  {thumb(e) && <img src={thumb(e)!} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">Live</span>
                    <MediumIcons entry={e} />
                  </div>
                  <div className="font-bold truncate">{e.title}</div>
                  <Actions entry={e} radioEnabled={webradioEnabled} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {onNow.length === 0 && upNext && (
        <div className="px-6 md:px-12 pb-6 text-sm text-neutral-400">
          Up next: <span className="font-semibold text-white">{upNext.title}</span> at {fmtTime(new Date(upNext.start))} on{" "}
          {dayName.format(new Date(upNext.start))}.
        </div>
      )}

      <div className="px-6 md:px-12 flex flex-wrap gap-2 pb-4">
        {(
          [
            ["all", "All"],
            ["radio", "Radio"],
            ["stream", "Streams"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setMedium(id)} className={chip(medium === id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="px-6 md:px-12 flex gap-2 overflow-x-auto pb-3 [scrollbar-width:none]">
        {days.map((d, i) => (
          <button
            key={d.getTime()}
            type="button"
            onClick={() => setDayIndex(i)}
            className={`flex-shrink-0 w-16 rounded-xl border py-2 text-center transition cursor-pointer ${
              i === dayIndex ? "bg-brand text-black border-brand" : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-600"
            }`}
          >
            <div className="text-[11px] font-semibold uppercase">{i === 0 ? "Today" : dayName.format(d)}</div>
            <div className="text-lg font-black leading-tight">{d.getDate()}</div>
            <div className={`mx-auto mt-1 h-1 w-1 rounded-full ${counts[i] ? (i === dayIndex ? "bg-black" : "bg-brand") : "bg-transparent"}`} />
          </button>
        ))}
      </div>

      <div className="px-6 md:px-12 pt-2 space-y-3">
        <h2 className="text-lg font-bold">{dayLong.format(day)}</h2>
        {entries === null ? (
          <div className="text-xs text-neutral-500">Loading schedule...</div>
        ) : dayEntries.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
            Nothing scheduled for this day.
          </div>
        ) : (
          dayEntries.map((e) => {
            const start = new Date(e.start);
            const end = new Date(e.end);
            const live = e.status !== "cancelled" && start.getTime() <= now && end.getTime() > now;
            const past = end.getTime() <= now;
            const cancelled = e.status === "cancelled";
            return (
              <div
                key={e.id}
                className={`flex gap-4 rounded-xl border bg-neutral-900 p-4 ${live ? "border-red-900/70" : "border-neutral-800"} ${past || cancelled ? "opacity-60" : ""}`}
              >
                <div className="w-20 flex-shrink-0 text-sm font-bold text-brand leading-tight">
                  {fmtTime(start)}
                  <div className="text-[11px] font-medium text-neutral-500">until {fmtTime(end)}</div>
                </div>
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-800">
                  {thumb(e) ? (
                    <img src={thumb(e)!} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <img src="/logos/ftnplus_favicon.png" alt="" className="h-7 w-7 object-contain opacity-60" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className={`font-bold ${cancelled ? "line-through" : ""}`}>{e.title}</div>
                    {live && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">Live</span>}
                    {cancelled && <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">Cancelled</span>}
                    {e.tag !== "live" && !cancelled && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{e.tag}</span>
                    )}
                    <MediumIcons entry={e} />
                  </div>
                  {e.presenter && <div className="text-xs text-neutral-400">with {e.presenter}</div>}
                  {e.description && <div className="text-xs text-neutral-500 line-clamp-2">{e.description}</div>}
                  {!past && !cancelled && <Actions entry={e} radioEnabled={webradioEnabled} />}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
