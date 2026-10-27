import React from "react";
import Link from "next/link";
import { formatTimeAgo, calculateReadingTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface GsStory {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  category: string;
  coverImageUrl?: string | null;
  content?: string | null;
  publishedAt?: any;
  createdAt?: any;
  authorUsername?: string | null;
  authorName?: string | null;
}

export type GsTone = "white" | "gold" | "dark";
const TONES: Record<GsTone, string> = {
  white: "bg-white text-neutral-900 border border-neutral-200 dark:bg-neutral-900 dark:text-white dark:border-neutral-800",
  gold: "bg-brand text-brand-ink",
  dark: "bg-[#16110a] text-[#fff8e6] dark:bg-black",
};

export const storyAuthor = (s: GsStory) => s.authorUsername || s.authorName || "FTN Editorial";
export const storyMeta = (s: GsStory) =>
  `${storyAuthor(s)} · ${formatTimeAgo(s.publishedAt || s.createdAt)}`;
export const storyRead = (s: GsStory) => (s.content ? calculateReadingTime(s.content) : "");

export function GsSectionHeading({ title, href, label }: { title: string; href?: string; label?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 className="text-3xl font-extrabold sm:text-4xl">{title}</h2>
      {href && (
        <Link href={href} className="gs-bar-link pb-0.5 text-sm font-bold">
          {label || "See all"} →
        </Link>
      )}
    </div>
  );
}

/**
 * One story. With a cover image it is a full-bleed image tile with the headline on a scrim; without one
 * it becomes a colour tile that carries the summary, so a missing image never leaves a hole.
 */
export function GsStoryTile({
  story,
  tone = "white",
  big,
  className,
}: {
  story: GsStory;
  tone?: GsTone;
  big?: boolean;
  className?: string;
}) {
  const href = `/articles/${story.slug}`;
  if (story.coverImageUrl) {
    return (
      <Link
        href={href}
        className={cn("group relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-[1.75rem] bg-neutral-900 text-white", big && "min-h-[420px] sm:min-h-[520px]", className)}
      >
        <img
          src={story.coverImageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="relative z-10 space-y-2 p-5 sm:p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-brand">{story.category}</div>
          <h3 className={cn("font-bold leading-[1.1]", big ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl")}>{story.title}</h3>
          <div className="text-xs text-white/75">{storyMeta(story)}</div>
        </div>
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={cn("group flex min-h-[220px] flex-col justify-between gap-6 rounded-[1.75rem] p-5 transition hover:-translate-y-0.5 sm:p-6", TONES[tone], big && "min-h-[320px]", className)}
    >
      <div className="space-y-2.5">
        <div className={cn("text-xs font-bold uppercase tracking-widest", tone === "white" ? "text-brand-text" : tone === "dark" ? "text-brand" : "opacity-70")}>
          {story.category}
        </div>
        <h3 className={cn("font-bold leading-[1.1]", big ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl")}>{story.title}</h3>
        {story.summary && <p className="line-clamp-3 text-sm opacity-75">{story.summary}</p>}
      </div>
      <div className="text-xs opacity-70">{storyMeta(story)}</div>
    </Link>
  );
}
