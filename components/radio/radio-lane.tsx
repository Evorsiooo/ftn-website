"use client";
import React, { useRef } from "react";
import { IconArrowNarrowLeft, IconArrowNarrowRight } from "@tabler/icons-react";

// Same lane chrome as the FTN+ video swimlanes: title, round arrow buttons, scroller.
export function RadioLane({ title, children }: { title: string; children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: direction === "left" ? -400 : 400, behavior: "smooth" });
  };

  return (
    <div className="w-full py-4 space-y-3">
      <div className="flex items-center justify-between px-6 md:px-12">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{title}</h2>
        <div className="flex items-center gap-2">
          <button
            aria-label="Scroll left"
            onClick={() => scroll("left")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <IconArrowNarrowLeft className="h-4 w-4" />
          </button>
          <button
            aria-label="Scroll right"
            onClick={() => scroll("right")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <IconArrowNarrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth px-6 md:px-12 py-2 [scrollbar-width:none] overscroll-x-auto no-scrollbar"
      >
        {children}
      </div>
    </div>
  );
}

export interface RadioCardProps {
  title: string;
  presenter: string;
  artUrl: string | null;
  badge?: string;
  badgeTone?: "live" | "neutral";
  timeLabel?: string;
  tag?: string;
}

// Mirrors the 16:9 video card: art on top, gradient wash, title underneath.
export function RadioCard({ title, presenter, artUrl, badge, badgeTone = "neutral", timeLabel, tag }: RadioCardProps) {
  return (
    <div className="group relative flex-shrink-0 w-64 sm:w-72 md:w-80 overflow-hidden rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition duration-300 flex flex-col">
      <div className="relative aspect-video w-full overflow-hidden bg-neutral-950">
        {artUrl ? (
          <img
            src={artUrl}
            alt={title}
            className="h-full w-full object-cover group-hover:scale-105 transition duration-500"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-neutral-800 via-neutral-900 to-black flex items-center justify-center">
            <img src="/logos/ftnplus_favicon.png" alt="" className="h-10 w-10 object-contain opacity-60" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent opacity-80" />
        {badge && (
          <div className="absolute top-2.5 left-2.5 z-10">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${
                badgeTone === "live" ? "bg-red-600" : "bg-black/70 backdrop-blur-sm"
              }`}
            >
              {badge}
            </span>
          </div>
        )}
      </div>
      <div className="p-3.5 space-y-1">
        <h3 className="text-xs sm:text-sm font-bold text-neutral-200 group-hover:text-white line-clamp-2 transition-colors leading-snug">
          {title}
        </h3>
        <div className="text-[11px] text-neutral-400 truncate">with {presenter}</div>
        {timeLabel && (
          <div className="text-[11px] font-semibold text-[#FFBB14]">
            {timeLabel}
            {tag && tag !== "live" ? ` · ${tag}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
