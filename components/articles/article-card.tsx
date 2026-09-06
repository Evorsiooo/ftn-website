import React from "react";
import Link from "next/link";
import { DirectionAwareHover } from "@/components/ui/direction-aware-hover";
import { formatDate } from "@/lib/utils";

export interface ArticleCardProps {
  slug: string;
  title: string;
  summary: string;
  category: string;
  coverImageUrl?: string | null;
  publishedAt?: Date | string | number | null;
  authorName?: string | null;
}

export function FeaturedArticleCard({
  slug,
  title,
  summary,
  coverImageUrl = "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&auto=format&fit=crop&q=60",
}: ArticleCardProps) {
  return (
    <Link href={`/articles/${slug}`} className="group relative block overflow-hidden rounded-2xl border border-neutral-800">
      <div className="relative h-72 sm:h-96 w-full">
        <DirectionAwareHover imageUrl={coverImageUrl || "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&auto=format&fit=crop&q=60"}>
          <div className="space-y-2">
            <h3 className="text-xl sm:text-2xl font-bold text-white leading-tight">
              {title}
            </h3>
            <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
              {summary}
            </p>
          </div>
        </DirectionAwareHover>
      </div>
    </Link>
  );
}

export function StandardArticleCard({
  slug,
  title,
  summary,
  publishedAt,
  authorName,
}: ArticleCardProps) {
  return (
    <Link
      href={`/articles/${slug}`}
      className="group flex flex-col justify-between rounded-2xl border border-neutral-800 bg-neutral-950 p-6 transition-all duration-200 hover:border-neutral-700 hover:shadow-lg"
    >
      <div className="space-y-3">
        <div className="text-xs text-neutral-400">
          <span>{formatDate(publishedAt)}</span>
        </div>
        <h3 className="text-lg font-bold text-white leading-snug">
          {title}
        </h3>
        <p className="text-xs text-neutral-400 leading-relaxed line-clamp-3">
          {summary}
        </p>
      </div>

      <div className="mt-4 pt-4 border-t border-neutral-850 flex items-center justify-between text-xs text-neutral-400">
        <span>{authorName || "Editorial Staff"}</span>
        <span className="font-semibold text-white group-hover:translate-x-1 transition-transform">
          Read →
        </span>
      </div>
    </Link>
  );
}
