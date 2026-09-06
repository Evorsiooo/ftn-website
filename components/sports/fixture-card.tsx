"use client";
import React from "react";
import { WobbleCard } from "@/components/ui/wobble-card";
import { Timeline } from "@/components/ui/timeline";
import { formatDate } from "@/lib/utils";
import { Calendar } from "lucide-react";

export function FeaturedMatchCard({
  title,
  homeTeam,
  awayTeam,
  scheduledDate,
}: {
  title: string;
  homeTeam: string;
  awayTeam?: string;
  scheduledDate: Date | string;
  leagueName?: string;
}) {
  return (
    <WobbleCard containerClassName="col-span-1 min-h-[260px]">
      <div className="max-w-xs space-y-3">
        <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug">
          {title}
        </h3>
        <p className="text-sm font-semibold text-neutral-200">
          {homeTeam} {awayTeam ? `vs. ${awayTeam}` : "Grand Prix"}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-neutral-300 pt-2">
          <Calendar className="h-3.5 w-3.5" />
          <span>Scheduled: {formatDate(scheduledDate)}</span>
        </div>
      </div>
    </WobbleCard>
  );
}

export function SeasonTimeline({
  items,
}: {
  items: { title: string; content: React.ReactNode }[];
}) {
  return (
    <div className="w-full">
      <Timeline data={items} />
    </div>
  );
}
