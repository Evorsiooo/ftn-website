"use client";
import React from "react";
import { IconPlayerPlay } from "@tabler/icons-react";
import { Button, GUTTER, LivePill } from "@/components/ftn/ui";
import { cn } from "@/lib/utils";

export interface BillboardItem {
  id: string;
  title: string;
  description: string;
  category: string;
  backdropUrl: string;
  isLive?: boolean;
  /** Replaces the category line, e.g. "Up next · in 2h 14m". */
  kicker?: string;
  /** Overrides the watch link and button label (e.g. a scheduled broadcast). */
  href?: string;
  ctaLabel?: string;
}

/**
 * Full-bleed hero. The headline sits on the image. A live stream gets the red LIVE badge (the hero is artwork);
 * otherwise the one line above the headline is plain text. `aside` is an optional right-hand slot on wide screens.
 */
export function OTTBillboard({ item, aside, compact }: { item: BillboardItem; aside?: React.ReactNode; compact?: boolean }) {
  const cta = (
    <Button href={item.href ?? `/plus/watch/${item.id}`} size="lg">
      <IconPlayerPlay className="h-5 w-5 fill-current" />
      {item.ctaLabel ?? (item.isLive ? "Watch live" : "Watch now")}
    </Button>
  );
  return (
    <div className={cn("relative w-full overflow-hidden select-none text-white", compact ? "h-[58vh] min-h-[440px] max-h-[560px]" : "h-[78vh] min-h-[540px] max-h-[760px]")}>
      <img
        src={item.backdropUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center"
        fetchPriority="high"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-black/30" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/25 to-transparent w-full md:w-3/4" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ftn-bg to-transparent" />

      <div className={cn("relative z-10 h-full flex items-end justify-between gap-10", compact ? "pb-20 md:pb-16" : "pb-28 md:pb-24", compact && "flex-col items-start md:flex-row md:items-end", GUTTER)}>
        <div className="max-w-3xl space-y-4">
          {item.isLive ? (
            <div className="flex items-center gap-3">
              <LivePill />
              <p className="text-sm font-semibold text-white/80">{item.category}</p>
            </div>
          ) : (
            <p className="text-sm font-semibold text-white/80">{item.kicker ?? item.category}</p>
          )}
          <h1 className="ftn-display text-4xl sm:text-6xl md:text-7xl line-clamp-3 pb-1 [text-wrap:balance]">{item.title}</h1>
          {!compact && item.description && <p className="text-sm sm:text-lg text-white/85 line-clamp-3 leading-relaxed max-w-2xl">{item.description}</p>}
          {!compact && <div className="pt-3">{cta}</div>}
        </div>
        {compact && <div className="flex-shrink-0">{cta}</div>}
        {aside && <div className="hidden lg:flex flex-col gap-3 w-[22rem] flex-shrink-0">{aside}</div>}
      </div>
    </div>
  );
}
