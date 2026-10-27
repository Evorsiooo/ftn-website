"use client";
import React from "react";
import { IconHeadphones, IconPlayerPlay } from "@tabler/icons-react";
import { useSiteConfig } from "@/lib/site-config-context";
import type { ScheduleEntry } from "./use-schedule";
import { Button, GUTTER, ProgressBar } from "./ui";
import { ArtTile } from "./media";
import { cn } from "@/lib/utils";

function OnAirCard({ e, now, glass }: { e: ScheduleEntry; now: number; glass?: boolean }) {
  const { webradioEnabled } = useSiteConfig();
  const start = new Date(e.start).getTime();
  const end = new Date(e.end).getTime();
  const watch = e.onStream && e.youtubeId;
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-3xl p-3 pr-4 border",
        glass ? "bg-black/45 backdrop-blur-xl border-white/15 text-white" : "bg-ftn-surface border-ftn-line ftn-shadow"
      )}
    >
      <ArtTile src={e.artUrl} className="h-16 w-16 flex-shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className={cn("text-xs font-semibold", glass ? "text-white/70" : "text-ftn-text-3")}>{watch ? "Livestream" : "FTN Radio"}</div>
        <div className="ftn-title text-base truncate">{e.title}</div>
        {e.presenter && <div className={cn("text-xs truncate", glass ? "text-white/70" : "text-ftn-text-2")}>with {e.presenter}</div>}
        <ProgressBar value={Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))} className={glass ? "bg-white/25" : undefined} />
      </div>
      {watch ? (
        <Button href={`/plus/watch/${e.youtubeId}`} size="sm" aria-label={`Watch ${e.title}`}>
          <IconPlayerPlay className="h-3.5 w-3.5 fill-current" /> Watch
        </Button>
      ) : (
        e.onRadio &&
        webradioEnabled && (
          <Button href="/plus/radio" size="sm" aria-label={`Listen to ${e.title}`}>
            <IconHeadphones className="h-3.5 w-3.5" /> Listen
          </Button>
        )
      )}
    </div>
  );
}

/** What is on air now, as glass cards inside the hero (wide screens). Renders nothing when nothing is live. */
export function OnAirGlass({ live, now }: { live: ScheduleEntry[]; now: number }) {
  if (live.length === 0) return null;
  return (
    <>
      {live.slice(0, 2).map((e) => (
        <OnAirCard key={e.id} e={e} now={now} glass />
      ))}
    </>
  );
}

/** "On air now" below the hero, for screens too narrow to show the glass cards in it. */
export function OnAirStrip({ live, now, className }: { live: ScheduleEntry[]; now: number; className?: string }) {
  if (live.length === 0) return null;
  return (
    <section className={cn("space-y-3.5", GUTTER, className)}>
      <h2 className="ftn-title text-2xl">On air now</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {live.map((e) => (
          <OnAirCard key={e.id} e={e} now={now} />
        ))}
      </div>
    </section>
  );
}
