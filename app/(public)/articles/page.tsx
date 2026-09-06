export const runtime = "edge";
import React from "react";
import type { Metadata } from "next";
import { getDb } from "@/db";
import { getPublishedArticles } from "@/lib/articles";
import { ArticlesClientView } from "@/components/articles/articles-client-view";

export const metadata: Metadata = {
  title: "Articles & Archive",
  description: "Browse the complete archive of news, investigative reports, politics, and opinion pieces from FTN.",
};

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ author?: string; category?: string; search?: string }>;
}) {
  const { author, category, search } = await searchParams;
  let articles: any[] = [];

  try {
    const d1 = (process.env as any).DB as D1Database;
    if (d1) {
      const db = getDb(d1);
      articles = await getPublishedArticles(db, {
        author,
        category,
        search,
        limit: 100,
      });
    }
  } catch (err) {
    console.error("Server fetch articles error:", err);
  }

  return (
    <ArticlesClientView
      initialArticles={articles}
      authorParam={author}
      categoryParam={category}
    />
  );
}
