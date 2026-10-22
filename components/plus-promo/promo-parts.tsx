"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { plusHref, type PlusRef } from "@/lib/plus-links";
import type { PlusNowSportsEvent } from "@/lib/plus-now-types";

// Shared pieces for the FTN+ promos on the news site. They follow the site theme: white
// panels in light mode, dark panels in dark mode, with FTN+ gold for the action.

export const panelClass =
  "rounded-3xl border border-neutral-200 bg-white text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:shadow-none";
export const cardClass =
  "flex min-w-0 items-center gap-3.5 rounded-2xl border border-neutral-200 bg-neutral-50 p-3.5 dark:border-neutral-800 dark:bg-neutral-900";
export const goldButtonClass =
  "inline-flex h-9 flex-none items-center justify-center gap-1.5 rounded-lg bg-[#FFBB14] px-4 text-xs font-black text-black shadow-[0px_2px_0px_0px_#FFFFFF40_inset] transition hover:bg-[#e5a710] active:scale-[0.98] cursor-pointer";

/** "in 2h 14m" style countdown; re-renders every 30s. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function formatIn(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 1) return "any moment";
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}

export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
      Live
    </span>
  );
}

export function PromoArt({ src, className }: { src?: string | null; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex-none overflow-hidden rounded-xl bg-gradient-to-br from-amber-200 to-amber-400 dark:from-neutral-800 dark:to-neutral-700",
        className
      )}
    >
      {src ? <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : (
        <img src="/logos/ftnplus_cropped_transparent.png" alt="" className="absolute inset-0 m-auto h-1/2 w-auto opacity-80" />
      )}
    </div>
  );
}

export function PromoCard({
  art,
  eyebrow,
  eyebrowClass,
  title,
  sub,
  action,
}: {
  art?: string | null;
  eyebrow: React.ReactNode;
  eyebrowClass?: string;
  title: string;
  sub?: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className={cardClass}>
      <PromoArt src={art} className="h-16 w-16" />
      <div className="min-w-0 flex-1">
        <div className={cn("text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber-600 dark:text-[#FFBB14]", eyebrowClass)}>
          {eyebrow}
        </div>
        <div className="truncate text-[15px] font-bold leading-snug">{title}</div>
        {sub && <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export function PromoLink({ href, pref, children, className }: { href: string; pref: PlusRef; children: React.ReactNode; className?: string }) {
  return (
    <Link href={plusHref(href, pref)} prefetch={false} className={cn(goldButtonClass, className)}>
      {children}
    </Link>
  );
}

export function sportsTitle(e: PlusNowSportsEvent): string {
  if (e.kind === "team" && e.home && e.away) {
    return e.homeScore !== null && e.awayScore !== null
      ? `${e.home} ${e.homeScore} – ${e.awayScore} ${e.away}`
      : `${e.home} vs ${e.away}`;
  }
  return `${e.leagueName} · ${e.label}`;
}
