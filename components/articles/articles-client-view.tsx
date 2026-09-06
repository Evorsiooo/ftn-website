"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { formatTimeAgo, formatMonthYear, calculateReadingTime } from "@/lib/utils";
import { Clock, Newspaper, ArrowLeft, User } from "lucide-react";

const CATEGORIES = [
  { id: "all", label: "All Stories" },
  { id: "news", label: "News" },
  { id: "politics", label: "Politics" },
  { id: "business", label: "Business" },
  { id: "technology", label: "Technology" },
  { id: "entertainment", label: "Entertainment" },
  { id: "opinion", label: "Opinion" },
];

export function ArticlesClientView({
  initialArticles,
  authorParam,
  categoryParam,
}: {
  initialArticles: any[];
  authorParam?: string;
  categoryParam?: string;
}) {
  const [articles, setArticles] = useState<any[]>(initialArticles || []);
  const [selectedCategory, setSelectedCategory] = useState(categoryParam || "all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If category changed from initial and not author filtered
    if (selectedCategory === (categoryParam || "all") && initialArticles?.length > 0 && !authorParam) {
      setArticles(initialArticles);
      return;
    }

    setLoading(true);
    let url = `/api/articles?limit=100`;
    if (authorParam) {
      url += `&author=${encodeURIComponent(authorParam)}`;
    } else if (selectedCategory !== "all") {
      url += `&category=${encodeURIComponent(selectedCategory)}`;
    }

    fetch(url)
      .then((res) => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.articles)) {
          setArticles(data.articles);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authorParam, selectedCategory, categoryParam, initialArticles]);

  const authorInfo = authorParam && articles.length > 0 ? {
    username: articles[0].authorUsername || authorParam,
    avatar: articles[0].authorAvatar,
  } : null;

  // Group articles by Month
  const monthlyArchives: Record<string, any[]> = {};
  articles.forEach((art) => {
    const monthYear = formatMonthYear(art.publishedAt || art.createdAt) || "Archive";
    if (!monthlyArchives[monthYear]) {
      monthlyArchives[monthYear] = [];
    }
    monthlyArchives[monthYear].push(art);
  });

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-8 pt-24 sm:pt-28 pb-12 space-y-10 text-neutral-900 dark:text-white">
      {/* Top Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-6 space-y-4">
        {authorParam ? (
          <div className="space-y-3">
            <Link
              href="/articles"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> All Journalists
            </Link>

            <div className="flex items-center gap-4 pt-1">
              <div className="h-14 w-14 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden flex items-center justify-center font-bold text-lg text-neutral-800 dark:text-white shrink-0 border-2 border-neutral-300 dark:border-neutral-700">
                {authorInfo?.avatar ? (
                  <img
                    src={authorInfo.avatar}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <User className="h-6 w-6 text-neutral-500 dark:text-neutral-400" />
                )}
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                  Stories by @{authorInfo?.username || authorParam}
                </h1>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {articles.length}{" "}
                  {articles.length === 1 ? "published story" : "published stories"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 dark:text-white flex items-center gap-3">
              <Newspaper className="h-8 w-8 text-blue-600 dark:text-blue-400" /> FTN Articles & Archive
            </h1>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                    selectedCategory === cat.id
                      ? "bg-blue-600 text-white shadow-[0px_2px_0px_0px_#FFFFFF40_inset]"
                      : "bg-neutral-100 border border-neutral-200 text-neutral-700 hover:text-black hover:bg-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-white"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Articles Grid by Month */}
      {loading ? (
        <div className="p-16 text-center text-xs text-neutral-500 dark:text-neutral-400">Loading stories...</div>
      ) : articles.length === 0 ? (
        <div className="p-16 text-center rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 space-y-3 shadow-sm dark:shadow-none">
          <Newspaper className="h-10 w-10 text-neutral-400 dark:text-neutral-600 mx-auto" />
          <h2 className="text-lg font-bold text-neutral-900 dark:text-white">No Stories Found</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
            {authorParam
              ? "This author hasn't published any articles yet."
              : "No articles matched the selected category filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {Object.entries(monthlyArchives).map(([month, monthArticles]) => (
            <div key={month} className="space-y-6">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">{month}</h2>
                <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                  {monthArticles.length} {monthArticles.length === 1 ? "article" : "articles"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {monthArticles.map((art) => (
                  <Link
                    key={art.id}
                    href={`/articles/${art.slug}`}
                    className="group rounded-2xl border border-neutral-200 bg-white overflow-hidden flex flex-col hover:border-neutral-300 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700 dark:shadow-none transition"
                  >
                    {art.coverImageUrl && (
                      <div className="h-44 w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900">
                        <img
                          src={art.coverImageUrl}
                          alt={art.title}
                          className="h-full w-full object-cover group-hover:scale-105 transition duration-500"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    )}

                    <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                          <span className="uppercase font-mono text-[#00a9d2] font-bold">
                            {art.category}
                          </span>
                          <span>•</span>
                          <span>{formatTimeAgo(art.publishedAt || art.createdAt)}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-medium">
                            <Clock className="h-3 w-3" />
                            {calculateReadingTime(art.content)}
                          </span>
                        </div>

                        <h3 className="font-bold text-base sm:text-lg text-neutral-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition leading-snug">
                          {art.title}
                        </h3>

                        <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                          {art.summary}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-900 text-xs text-neutral-500 dark:text-neutral-400 mt-3">
                        {art.authorAvatar && (
                          <img
                            src={art.authorAvatar}
                            alt=""
                            className="h-4 w-4 rounded-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        )}
                        <span>
                          By{" "}
                          <strong className="text-neutral-800 dark:text-neutral-200">
                            {art.authorUsername || art.authorName}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
