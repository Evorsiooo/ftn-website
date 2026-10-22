"use client";
export const runtime = "edge";
import React, { useEffect, useMemo, useState } from "react";
import { IconRadio, IconBroadcast, IconPlayerPlay, IconHeadphones } from "@tabler/icons-react";
import { useSiteConfig } from "@/lib/site-config-context";
import { PageShell, PageHeader } from "@/components/ftn/page";
import { Button, EmptyState, GUTTER, LivePill, Segmented, Skeleton, Tag } from "@/components/ftn/ui";
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

function Actions({ entry, radioEnabled }: { entry: Entry; radioEnabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {entry.onStream && entry.youtubeId && (
        <Button href={`/plus/watch/${entry.youtubeId}`} size="sm">
          <IconPlayerPlay className="h-3.5 w-3.5 fill-current" /> Watch
        </Button>
      )}
      {entry.onRadio && radioEnabled && (
        <Button href="/plus/radio" size="sm" variant="ghost">
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
    <div className={cn("flex gap-2 overflow-x-auto pb-2 no-scrollbar", GUTTER)}>
      {days.map((d, i) => (
        <button
          key={d.getTime()}
          type="button"
          onClick={() => setDayIndex(i)}
          aria-pressed={i === dayIndex}
          className={cn(
            "flex-shrink-0 w-[4.25rem] rounded-2xl border py-2.5 text-center transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
            i === dayIndex
              ? "bg-brand text-brand-ink border-brand"
              : "bg-ftn-surface border-ftn-line text-ftn-text-2 hover:border-ftn-line-strong"
          )}
        >
          <div className="ftn-eyebrow opacity-80">{i === 0 ? "Today" : dayName.format(d)}</div>
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
        <div className={cn("pb-8 space-y-3", GUTTER)}>
          <LivePill>On now</LivePill>
          <div className="grid gap-3 md:grid-cols-2">
            {onNow.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-4 rounded-2xl border border-live/35 bg-gradient-to-r from-live/10 to-ftn-surface p-4"
              >
                <ArtTile src={thumb(e)} className="h-16 w-16 flex-shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="ftn-title text-base truncate">{e.title}</div>
                    <MediumIcons entry={e} />
                  </div>
                  <Actions entry={e} radioEnabled={webradioEnabled} />
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
        <h2 className="ftn-title text-xl">{dayLong.format(day)}</h2>
        {entries === null ? (
          <div className="space-y-3" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : dayEntries.length === 0 ? (
          <EmptyState icon={<IconBroadcast />} title="Nothing scheduled" description="Nothing is on the schedule for this day." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-ftn-line bg-ftn-surface">
            {dayEntries.map((e) => {
              const start = new Date(e.start);
              const end = new Date(e.end);
              const live = e.status !== "cancelled" && start.getTime() <= now && end.getTime() > now;
              const past = end.getTime() <= now;
              const cancelled = e.status === "cancelled";
              return (
                <div
                  key={e.id}
                  className={cn(
                    "flex gap-4 p-4 border-t border-ftn-line first:border-t-0",
                    live && "bg-gradient-to-r from-live/10 to-transparent",
                    (past || cancelled) && "opacity-60"
                  )}
                >
                  <div className="w-20 sm:w-24 flex-shrink-0 ftn-mono text-sm font-medium leading-tight whitespace-nowrap">
                    {fmtTime(start)}
                    <div className="text-xs text-ftn-text-3">until {fmtTime(end)}</div>
                  </div>
                  <ArtTile src={thumb(e)} className="hidden sm:block h-14 w-14 flex-shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={cn("ftn-title text-base", cancelled && "line-through")}>{e.title}</div>
                      {live && <LivePill>Live</LivePill>}
                      {cancelled && <Tag>Cancelled</Tag>}
                      {e.tag !== "live" && !cancelled && <Tag>{e.tag}</Tag>}
                      <MediumIcons entry={e} />
                    </div>
                    {e.presenter && <div className="text-xs text-ftn-text-2">with {e.presenter}</div>}
                    {e.description && <div className="text-xs text-ftn-text-3 line-clamp-2">{e.description}</div>}
                    {!past && !cancelled && <Actions entry={e} radioEnabled={webradioEnabled} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
