"use client";
import React from "react";
import { IconPlayerPlay } from "@tabler/icons-react";
import { Button, LivePill, Tag, GUTTER } from "@/components/ftn/ui";
import { cn } from "@/lib/utils";

export interface BillboardItem {
  id: string;
  title: string;
  description: string;
  category: string;
  backdropUrl: string;
  isLive?: boolean;
  /** Replaces the live/category tags, e.g. "Up next · in 2h 14m". */
  kicker?: string;
  /** Overrides the watch link and button label (e.g. a scheduled broadcast). */
  href?: string;
  ctaLabel?: string;
}

export function OTTBillboard({ item }: { item: BillboardItem }) {
  return (
    <div className="relative w-full h-[60vh] min-h-[420px] max-h-[560px] overflow-hidden select-none">
      <img
        src={item.backdropUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center"
        fetchPriority="high"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ftn-bg via-ftn-bg/30 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-ftn-bg/90 via-ftn-bg/50 to-transparent w-full md:w-3/4" />

      <div className={cn("relative z-10 h-full flex flex-col justify-end pb-16 max-w-4xl space-y-4", GUTTER)}>
        <div className="flex items-center gap-2.5">
          {item.isLive && <LivePill>Live now</LivePill>}
          {item.kicker && <Tag tone="brand">{item.kicker}</Tag>}
          <Tag>{item.category}</Tag>
        </div>
        <h1 className="ftn-display text-4xl sm:text-5xl md:text-6xl text-ftn-text line-clamp-3 pb-1">{item.title}</h1>
        {item.description && (
          <p className="text-sm sm:text-base text-ftn-text-2 line-clamp-3 leading-relaxed max-w-2xl">{item.description}</p>
        )}
        <div className="pt-2">
          <Button href={item.href ?? `/plus/watch/${item.id}`} size="lg">
            <IconPlayerPlay className="h-5 w-5 fill-current" />
            {item.ctaLabel ?? (item.isLive ? "Watch live" : "Watch now")}
          </Button>
        </div>
      </div>
    </div>
  );
}
