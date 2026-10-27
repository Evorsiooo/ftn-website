"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { formatTimeAgo, formatMonthYear, calculateReadingTime } from "@/lib/utils";
import { gsCategory } from "@/components/gs/story";
import { Newspaper, ArrowLeft, User } from "lucide-react";

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
    <div className="text-neutral-900 dark:text-white">
      <section className="bg-brand text-brand-ink">
        <div className="mx-auto max-w-7xl px-4 pb-0 pt-10 sm:px-8 sm:pt-14">
          {authorParam ? (
            <div className="pb-10 sm:pb-14">
              <Link href="/articles" className="mb-5 inline-flex items-center gap-1.5 text-sm font-bold hover:underline">
                <ArrowLeft className="h-4 w-4" /> All stories
              </Link>
              <div className="flex items-center gap-5">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#16110a] text-[#fff8e6]">
                  {authorInfo?.avatar ? (
                    <img src={authorInfo.avatar} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <User className="h-8 w-8" />
                  )}
                </div>
                <div>
                  <h1 className="text-4xl font-extrabold leading-none sm:text-6xl">@{authorInfo?.username || authorParam}</h1>
                  <p className="mt-2 text-sm font-bold opacity-75">
                    {articles.length} {articles.length === 1 ? "published story" : "published stories"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-5xl font-extrabold leading-[0.95] sm:text-7xl">Every story we&apos;ve published.</h1>
              <nav className="mt-8 flex gap-1 overflow-x-auto" aria-label="Categories">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    aria-current={selectedCategory === cat.id ? "true" : undefined}
                    className={`shrink-0 cursor-pointer border-b-4 px-4 py-3 text-sm font-bold transition ${
                      selectedCategory === cat.id ? "border-[#16110a]" : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </nav>
            </>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8">
        {loading ? (
          <div className="p-16 text-center text-sm text-neutral-500 dark:text-neutral-400">Loading stories...</div>
        ) : articles.length === 0 ? (
          <div className="rounded-[1.75rem] border border-neutral-200 bg-white p-14 text-center dark:border-neutral-800 dark:bg-neutral-900">
            <Newspaper className="mx-auto mb-3 h-9 w-9 text-neutral-400" />
            <h2 className="text-2xl font-extrabold">No stories found</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
              {authorParam ? "This author hasn't published any articles yet." : "No articles matched the selected category."}
            </p>
          </div>
        ) : (
          <div className="space-y-14">
            {Object.entries(monthlyArchives).map(([month, monthArticles]) => (
              <section key={month} className="grid gap-6 lg:grid-cols-[220px_1fr] lg:gap-12">
                <div className="lg:sticky lg:top-24 lg:self-start">
                  <h2 className="text-3xl font-extrabold leading-none sm:text-4xl">{month}</h2>
                  <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                    {monthArticles.length} {monthArticles.length === 1 ? "story" : "stories"}
                  </p>
                </div>

                <div className="divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                  {monthArticles.map((art) => (
                    <Link key={art.id} href={`/articles/${art.slug}`} className="group flex gap-5 py-6">
                      {art.coverImageUrl && (
                        <div className="hidden h-28 w-44 shrink-0 overflow-hidden rounded-2xl bg-neutral-200 dark:bg-neutral-800 sm:block">
                          <img
                            src={art.coverImageUrl}
                            alt=""
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-2">
                        {gsCategory(art.category) && <div className="text-xs font-bold uppercase tracking-widest text-brand-text">{art.category}</div>}
                        <h3 className="text-xl font-bold leading-tight group-hover:underline group-hover:decoration-brand group-hover:decoration-4 group-hover:underline-offset-4 sm:text-2xl">
                          {art.title}
                        </h3>
                        {art.summary && <p className="line-clamp-2 text-sm text-neutral-600 dark:text-neutral-400">{art.summary}</p>}
                        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                          {art.authorAvatar && (
                            <img src={art.authorAvatar} alt="" className="h-4 w-4 rounded-full object-cover" loading="lazy" decoding="async" />
                          )}
                          <span>{art.authorUsername || art.authorName}</span>
                          <span>·</span>
                          <span>{formatTimeAgo(art.publishedAt || art.createdAt)}</span>
                          <span>·</span>
                          <span>{calculateReadingTime(art.content)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
