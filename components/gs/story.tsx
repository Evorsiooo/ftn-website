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

/** "news" is the default section, so it is not worth saying; every other category is shown. */
export const gsCategory = (c?: string | null) => (c && c.toLowerCase() !== "news" ? c : null);

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
    // Image on top, text below on a solid panel, so a screenshot with text in it never sits behind the headline.
    return (
      <Link
        href={href}
        className={cn("group flex flex-col overflow-hidden rounded-[1.75rem] transition hover:-translate-y-0.5", TONES[tone === "white" ? "white" : tone], className)}
      >
        <div className={cn("overflow-hidden bg-neutral-200 dark:bg-neutral-800", big ? "aspect-[16/10] lg:aspect-auto lg:min-h-[340px] lg:flex-1" : "aspect-[16/10]")}>
          <img
            src={story.coverImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        </div>
        <div className="space-y-2 p-5 sm:p-6">
          {gsCategory(story.category) && (
            <div className={cn("text-xs font-bold uppercase tracking-widest", tone === "white" ? "text-brand-text" : tone === "dark" ? "text-brand" : "opacity-70")}>
              {story.category}
            </div>
          )}
          <h3 className={cn("font-bold leading-[1.1]", big ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl")}>{story.title}</h3>
          <div className="text-xs opacity-70">{storyMeta(story)}</div>
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
        {gsCategory(story.category) && (
          <div className={cn("text-xs font-bold uppercase tracking-widest", tone === "white" ? "text-brand-text" : tone === "dark" ? "text-brand" : "opacity-70")}>
            {story.category}
          </div>
        )}
        <h3 className={cn("font-bold leading-[1.1]", big ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl")}>{story.title}</h3>
        {story.summary && <p className="line-clamp-3 text-sm opacity-75">{story.summary}</p>}
      </div>
      <div className="text-xs opacity-70">{storyMeta(story)}</div>
    </Link>
  );
}
