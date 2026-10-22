"use client";
import React, { useRef } from "react";
import Link from "next/link";
import { IconArrowNarrowLeft, IconArrowNarrowRight, IconChevronRight, IconPlayerPlay } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { ArtBadge, GUTTER } from "./ui";

/** Art with a consistent fallback (brand mark on a soft gradient). */
export function ArtTile({
  src,
  alt = "",
  className,
  onError,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  onError?: () => void;
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
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-ftn-surface-2 to-ftn-bg flex items-center justify-center">
          <img src="/logos/ftnplus_favicon.png" alt="" className="h-1/3 max-h-12 w-1/3 max-w-12 object-contain opacity-60" />
        </div>
      )}
    </div>
  );
}

/** Horizontal lane: title, optional "see all", arrows on pointer devices only. */
export function Lane({
  title,
  href,
  hrefLabel = "See all",
  children,
  className,
}: {
  title: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => scrollRef.current?.scrollBy({ left: dir * 400, behavior: "smooth" });
  const arrow =
    "hidden pointer-fine:flex h-8 w-8 items-center justify-center rounded-full bg-ftn-surface border border-ftn-line text-ftn-text-2 hover:text-ftn-text hover:border-ftn-line-strong transition cursor-pointer";
  return (
    <section className={cn("w-full space-y-3.5", className)}>
      <div className={cn("flex items-end justify-between gap-4", GUTTER)}>
        <h2 className="ftn-title text-xl sm:text-2xl text-ftn-text">{title}</h2>
        <div className="flex items-center gap-2">
          {href && (
            <Link href={href} className="inline-flex items-center gap-0.5 text-xs text-ftn-text-2 hover:text-ftn-text mr-2">
              {hrefLabel} <IconChevronRight className="h-3.5 w-3.5" />
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
        className={cn("flex gap-4 overflow-x-auto scroll-smooth snap-x py-1 no-scrollbar [&>*]:snap-start", GUTTER)}
      >
        {children}
      </div>
    </section>
  );
}

const cardSurface =
  "group relative flex-shrink-0 overflow-hidden rounded-2xl bg-ftn-surface border border-ftn-line transition duration-300 hover:border-ftn-line-strong hover:-translate-y-0.5 flex flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** Base surface for any FTN+ card (video, show, league, event). */
export function CardSurface({
  href,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (href) {
    return (
      <Link href={href} className={cn(cardSurface, className)}>
        {children}
      </Link>
    );
  }
  return <div className={cn(cardSurface, "hover:translate-y-0", className)}>{children}</div>;
}

/** The one media card: video (16:9) and show (square) variants share this anatomy. */
export function MediaCard({
  href,
  art,
  alt,
  shape = "video",
  badge,
  badgeLive,
  showPlay,
  corner,
  title,
  children,
  lead,
  className,
}: {
  href?: string;
  art?: string | null;
  alt?: string;
  shape?: "video" | "square";
  badge?: string;
  badgeLive?: boolean;
  showPlay?: boolean;
  /** Top-right slot over the art (e.g. a remove button). */
  corner?: React.ReactNode;
  title: string;
  /** Meta lines under the title. */
  children?: React.ReactNode;
  /** Leading element beside the title (channel avatar). */
  lead?: React.ReactNode;
  className?: string;
}) {
  return (
    <CardSurface href={href} className={className}>
      <ArtTile src={art} alt={alt ?? title} className={shape === "video" ? "aspect-video w-full" : "aspect-square w-full"} />
      {showPlay && (
        <div className="absolute inset-x-0 top-0 aspect-video flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-200 pointer-events-none">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg">
            <IconPlayerPlay className="h-6 w-6 fill-current" />
          </div>
        </div>
      )}
      {badge && <ArtBadge live={badgeLive}>{badge}</ArtBadge>}
      {corner && <div className="absolute top-2 right-2 z-20">{corner}</div>}
      <div className="p-3.5 flex items-start gap-2.5">
        {lead}
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold text-ftn-text line-clamp-2 leading-snug">{title}</h3>
          {children}
        </div>
      </div>
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
    <div className={cn("flex gap-4 overflow-hidden", GUTTER)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex-shrink-0 rounded-2xl border border-ftn-line overflow-hidden",
            shape === "video" ? "w-64 sm:w-72 md:w-80" : "w-44 sm:w-48 md:w-52"
          )}
        >
          <div className={cn("ftn-skeleton !rounded-none", shape === "video" ? "aspect-video" : "aspect-square")} />
          <div className="p-3.5 space-y-2">
            <div className="ftn-skeleton h-3.5 w-4/5 rounded" />
            <div className="ftn-skeleton h-3 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
