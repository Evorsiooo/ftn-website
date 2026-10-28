"use client";
export const runtime = "edge";
import React, { useEffect, useMemo, useState } from "react";
import { IconRadio, IconBroadcast, IconPlayerPlay, IconHeadphones } from "@tabler/icons-react";
import { useSiteConfig } from "@/lib/site-config-context";
import { PageShell, PageHeader } from "@/components/ftn/page";
import { Button, EmptyState, GUTTER, LiveLabel, Segmented, Skeleton } from "@/components/ftn/ui";
import { ArtTile } from "@/components/ftn/media";
import { cn } from "@/lib/utils";
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

function Actions({ entry, radioEnabled, onArt }: { entry: Entry; radioEnabled: boolean; onArt?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {entry.onStream && entry.youtubeId && (
        <Button href={`/plus/watch/${entry.youtubeId}`} size="sm">
          <IconPlayerPlay className="h-3.5 w-3.5 fill-current" /> Watch
        </Button>
      )}
      {entry.onRadio && radioEnabled && (
        <Button href="/plus/radio" size="sm" variant={onArt ? "glass" : "ghost"}>
          <IconHeadphones className="h-3.5 w-3.5" /> Listen
        </Button>
      )}
    </div>
  );
}

function MediumIcons({ entry }: { entry: Entry }) {
  return (
    <span className="inline-flex items-center gap-1 text-ftn-text-3">
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

  // Deep link: ?date=YYYY-MM-DD opens that day.
  useEffect(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(new URLSearchParams(window.location.search).get("date") || "");
    if (!m) return;
    const target = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    const i = days.findIndex((d) => d.getTime() === target);
    if (i >= 0) setDayIndex(i);
  }, [days]);

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

  const dayChips = (
    <div className={cn("flex gap-2.5 overflow-x-auto py-2 no-scrollbar", GUTTER)}>
      {days.map((d, i) => (
        <button
          key={d.getTime()}
          type="button"
          onClick={() => setDayIndex(i)}
          aria-pressed={i === dayIndex}
          className={cn(
            "flex-shrink-0 w-[4.5rem] rounded-3xl border py-3 text-center transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
            i === dayIndex
              ? "bg-brand text-brand-ink border-brand ftn-shadow"
              : "bg-ftn-surface border-ftn-line text-ftn-text-2 hover:border-ftn-line-strong"
          )}
        >
          <div className="text-xs font-semibold">{i === 0 ? "Today" : dayName.format(d)}</div>
          <div className="ftn-display text-2xl pt-1">{d.getDate()}</div>
          <div
            className={cn(
              "mx-auto mt-1.5 h-1 w-1 rounded-full",
              counts[i] ? (i === dayIndex ? "bg-brand-ink" : "bg-brand") : "bg-transparent"
            )}
          />
        </button>
      ))}
    </div>
  );

  return (
    <PageShell>
      <PageHeader
        title="Schedule"
        subtitle={`Everything coming up on FTN Radio and the livestreams. Times are in your local time (${localZone()}).`}
      />

      {onNow.length > 0 && (
        <div className={cn("pb-8 space-y-4", GUTTER)}>
          <h2 className="ftn-title text-2xl">On now</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {onNow.map((e) => (
              <div key={e.id} className="relative overflow-hidden rounded-3xl ftn-shadow min-h-44 flex items-end text-white">
                <ArtTile src={thumb(e)} className="absolute inset-0" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
                <div className="relative z-10 w-full flex items-end justify-between gap-4 p-5">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="ftn-title text-xl truncate">{e.title}</div>
                      <span className="text-white/70">
                        <MediumIcons entry={e} />
                      </span>
                    </div>
                    <div className="text-sm text-white/75">
                      {e.presenter ? `with ${e.presenter} · ` : ""}until {fmtTime(new Date(e.end))}
                    </div>
                  </div>
                  <Actions entry={e} radioEnabled={webradioEnabled} onArt />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {onNow.length === 0 && upNext && (
        <div className={cn("pb-8 text-sm text-ftn-text-2", GUTTER)}>
          Up next: <span className="font-semibold text-ftn-text">{upNext.title}</span> at {fmtTime(new Date(upNext.start))} on{" "}
          {dayName.format(new Date(upNext.start))}.
        </div>
      )}

      <div className={cn("flex flex-wrap items-center justify-between gap-3 pb-4", GUTTER)}>
        <Segmented
          value={medium}
          onChange={setMedium}
          options={[
            { id: "all", label: "All" },
            { id: "radio", label: "Radio" },
            { id: "stream", label: "Streams" },
          ]}
        />
      </div>

      {dayChips}

      <div className={cn("pt-4 space-y-3", GUTTER)}>
        <h2 className="ftn-title text-2xl">{dayLong.format(day)}</h2>
        {entries === null ? (
          <div className="space-y-3" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : dayEntries.length === 0 ? (
          <EmptyState icon={<IconBroadcast />} title="Nothing scheduled" description="Nothing is on the schedule for this day." />
        ) : (
          <div className="space-y-3">
            {dayEntries.map((e, idx) => {
              const start = new Date(e.start);
              const end = new Date(e.end);
              const live = e.status !== "cancelled" && start.getTime() <= now && end.getTime() > now;
              const past = end.getTime() <= now;
              const cancelled = e.status === "cancelled";
              const prev = dayEntries[idx - 1];
              // A "now" marker between what has finished and what is still to come.
              const showNow = dayIndex === 0 && !past && !live && idx > 0 && prev && new Date(prev.end).getTime() <= now;
              const note = [e.presenter ? `with ${e.presenter}` : null, e.tag === "rebroadcast" ? "Rebroadcast" : e.tag === "simulcast" ? "Simulcast" : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <React.Fragment key={e.id}>
                  {showNow && (
                    <div className="flex items-center gap-3 py-1 text-live-ink text-xs font-bold" aria-label="Current time">
                      {fmtTime(new Date(now))} now
                      <span className="h-0.5 flex-1 bg-live/50" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "flex items-center gap-4 sm:gap-5 p-3 pr-4 sm:pr-5 rounded-3xl border border-ftn-line bg-ftn-surface ftn-shadow",
                      live && "ring-2 ring-live",
                      (past || cancelled) && "opacity-55"
                    )}
                  >
                    <div className="w-16 sm:w-20 flex-shrink-0 text-center ftn-display text-lg leading-tight">
                      {fmtTime(start)}
                      <div className="ftn-mono text-xs font-medium text-ftn-text-3 pt-0.5 tracking-normal">{fmtTime(end)}</div>
                    </div>
                    <ArtTile src={thumb(e)} className="hidden sm:block aspect-video w-44 flex-shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <div className={cn("ftn-title text-lg", cancelled && "line-through")}>{e.title}</div>
                        {live && <LiveLabel />}
                        {cancelled && <span className="text-xs font-semibold text-ftn-text-3">Cancelled</span>}
                        <MediumIcons entry={e} />
                      </div>
                      {note && <div className="text-sm text-ftn-text-2">{note}</div>}
                      {e.description && <div className="text-xs text-ftn-text-3 line-clamp-2">{e.description}</div>}
                      {!past && !cancelled && <Actions entry={e} radioEnabled={webradioEnabled} />}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
