"use client";
import React, { useRef } from "react";
import Link from "next/link";
import { IconArrowNarrowLeft, IconArrowNarrowRight, IconChevronRight, IconPlayerPlay } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { ArtBadge, GUTTER, ProgressBar } from "./ui";

/** Art with a consistent fallback (brand mark on a soft gradient). */
export function ArtTile({
  src,
  alt = "",
  className,
  onError,
  fallback,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  onError?: () => void;
  /** Replaces the default brand-mark fallback when there is no image. */
  fallback?: React.ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-ftn-surface-2", className)}>
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={onError}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        />
      ) : fallback ? (
        fallback
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-ftn-surface-2 via-ftn-surface to-ftn-surface-2 flex items-center justify-center">
          <img src="/logos/ftnplus_favicon.png" alt="" className="h-1/3 max-h-12 w-1/3 max-w-12 object-contain opacity-50" />
        </div>
      )}
    </div>
  );
}

/** Horizontal lane: title, optional "see all", arrows on pointer devices only. */
export function Lane({
  title,
  sub,
  href,
  hrefLabel = "See all",
  children,
  className,
}: {
  title: React.ReactNode;
  /** Small plain-text note beside the title (e.g. the time zone). */
  sub?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => scrollRef.current?.scrollBy({ left: dir * 480, behavior: "smooth" });
  const arrow =
    "hidden pointer-fine:flex h-9 w-9 items-center justify-center rounded-full bg-ftn-surface border border-ftn-line text-ftn-text-2 hover:text-ftn-text hover:border-ftn-line-strong transition cursor-pointer";
  return (
    <section className={cn("w-full space-y-4", className)}>
      <div className={cn("flex items-end justify-between gap-4", GUTTER)}>
        <h2 className="ftn-title text-2xl sm:text-3xl text-ftn-text">
          {title}
          {sub && <small className="ml-3 text-sm font-medium text-ftn-text-3">{sub}</small>}
        </h2>
        <div className="flex items-center gap-2">
          {href && (
            <Link href={href} className="inline-flex items-center gap-0.5 whitespace-nowrap text-sm font-semibold text-ftn-text-2 hover:text-ftn-text mr-2">
              {hrefLabel} <IconChevronRight className="h-4 w-4" />
            </Link>
          )}
          <button aria-label="Scroll left" onClick={() => scroll(-1)} className={arrow}>
            <IconArrowNarrowLeft className="h-4 w-4" />
          </button>
          <button aria-label="Scroll right" onClick={() => scroll(1)} className={arrow}>
            <IconArrowNarrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className={cn("flex gap-5 overflow-x-auto scroll-smooth snap-x scroll-px-5 md:scroll-px-12 py-2 no-scrollbar [&>*]:snap-start", GUTTER)}
      >
        {children}
      </div>
    </section>
  );
}

/** Base for any FTN+ card. No box of its own: the artwork is the card. */
export function CardSurface({
  href,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = cn(
    "group relative flex-shrink-0 flex flex-col focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand rounded-2xl",
    className
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return <div className={cls}>{children}</div>;
}

const shapeClass = { video: "aspect-video", square: "aspect-square", poster: "aspect-[4/5]" } as const;

/**
 * The one media card.
 * - "video" (16:9): artwork on top, title and meta below, for YouTube thumbnails that carry their own text.
 * - "square" and "poster": the title and meta sit on the artwork over a scrim.
 * The only badge is `live` (red). Anything else belongs in the meta lines as plain text.
 */
export function MediaCard({
  href,
  art,
  alt,
  shape = "video",
  live,
  liveLabel,
  showPlay,
  corner,
  topLeft,
  progress,
  title,
  children,
  lead,
  fallback,
  className,
}: {
  href?: string;
  art?: string | null;
  fallback?: React.ReactNode;
  alt?: string;
  shape?: "video" | "square" | "poster";
  /** Red LIVE badge over the artwork. */
  live?: boolean;
  liveLabel?: string;
  showPlay?: boolean;
  /** Top-right slot over the art (e.g. a remove button). */
  corner?: React.ReactNode;
  /** Top-left slot over the art, shown instead of the live badge when there is no live state (e.g. a start time). */
  topLeft?: React.ReactNode;
  /** 0 to 100: watched share, drawn along the bottom of the art. */
  progress?: number;
  title: string;
  /** Meta lines under the title (or over the art for square and poster). */
  children?: React.ReactNode;
  /** Leading element beside the title (channel avatar). */
  lead?: React.ReactNode;
  className?: string;
}) {
  const overlay = shape !== "video";
  return (
    <CardSurface href={href} className={className}>
      <div className={cn("relative overflow-hidden ftn-shadow", shape === "video" ? "rounded-2xl" : "rounded-3xl", shapeClass[shape])}>
        <ArtTile src={art} alt={alt ?? title} fallback={fallback} className="absolute inset-0" />
        {overlay && <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />}
        {overlay && topLeft && <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />}
        {showPlay && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-200 pointer-events-none">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg">
              <IconPlayerPlay className="h-6 w-6 fill-current" />
            </div>
          </div>
        )}
        {live ? <ArtBadge>{liveLabel}</ArtBadge> : topLeft ? <div className="absolute top-3 left-3.5 z-10 text-white drop-shadow-[0_1px_6px_rgb(0_0_0/0.6)]">{topLeft}</div> : null}
        {corner && <div className="absolute top-2 right-2 z-20">{corner}</div>}
        {overlay && (
          <div className="absolute inset-x-0 bottom-0 z-10 p-4 space-y-1 text-white">
            <h3 className="text-base font-bold leading-tight line-clamp-2 drop-shadow-sm">{title}</h3>
            <div className="text-xs text-white/75 space-y-0.5 [&_p]:truncate">{children}</div>
          </div>
        )}
        {progress !== undefined && (
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-end pointer-events-none">
            <ProgressBar value={progress} className="rounded-none bg-white/25" />
          </div>
        )}
      </div>
      {!overlay && (
        <div className="pt-3 px-1 flex items-start gap-2.5">
          {lead}
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="text-sm font-semibold text-ftn-text line-clamp-2 leading-snug">{title}</h3>
            {children}
          </div>
        </div>
      )}
    </CardSurface>
  );
}

/** Round channel avatar with initial fallback; links out without triggering the card. */
export function ChannelAvatar({
  logoUrl,
  title,
  channelId,
  fallbackText,
}: {
  logoUrl?: string;
  title?: string;
  channelId?: string;
  fallbackText?: string;
}) {
  const link = channelId
    ? channelId.startsWith("UC")
      ? `https://www.youtube.com/channel/${channelId}`
      : `https://www.youtube.com/${channelId}`
    : undefined;
  const base = "h-7 w-7 rounded-full shrink-0 border border-ftn-line-strong bg-ftn-surface-2";
  if (logoUrl) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={title || "YouTube channel"}
        className={cn(base, "relative z-10 overflow-hidden mt-0.5 hover:ring-2 hover:ring-brand transition")}
      >
        <img src={logoUrl} alt={title || "Channel"} className="h-full w-full object-cover" loading="lazy" decoding="async" />
      </a>
    );
  }
  return (
    <div
      title={title || "Channel"}
      className={cn(base, "mt-0.5 flex items-center justify-center text-xs font-bold text-ftn-text-2")}
    >
      {(fallbackText || title || "F").slice(0, 1).toUpperCase()}
    </div>
  );
}

/** Card skeletons so loading lanes keep their shape. */
export function LaneSkeleton({ shape = "video", count = 4 }: { shape?: "video" | "square"; count?: number }) {
  return (
    <div className={cn("flex gap-5 overflow-hidden", GUTTER)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex-shrink-0",
            shape === "video" ? "w-64 sm:w-72 md:w-80" : "w-44 sm:w-48 md:w-52"
          )}
        >
          <div className={cn("ftn-skeleton !rounded-2xl", shape === "video" ? "aspect-video" : "aspect-square")} />
          <div className="pt-3 space-y-2">
            <div className="ftn-skeleton h-3.5 w-4/5 rounded" />
            <div className="ftn-skeleton h-3 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
