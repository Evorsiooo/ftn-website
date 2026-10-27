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
    // Full-bleed image with the headline over it. The lower part of the image is darkened and blurred
    // (fading out upwards), so a cover that has text in it stays readable and a plain photo keeps its top intact.
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
        {/* The darkened, blurred band is sized by the text block itself (plus a short fade above it), not a fixed height. */}
        <div className="relative z-10 pt-12">
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent backdrop-blur-md [mask-image:linear-gradient(to_top,black_70%,transparent)] [-webkit-mask-image:linear-gradient(to_top,black_70%,transparent)]"
          />
          <div className="relative space-y-2 p-5 pt-0 sm:p-6 sm:pt-0">
            {gsCategory(story.category) && <div className="text-xs font-bold uppercase tracking-widest text-brand">{story.category}</div>}
            <h3 className={cn("font-bold leading-[1.1] [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]", big ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl")}>{story.title}</h3>
            <div className="text-xs text-white/80">{storyMeta(story)}</div>
          </div>
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
