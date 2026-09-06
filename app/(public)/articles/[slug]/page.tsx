export const runtime = "edge";
import React from "react";
import type { Metadata } from "next";
import { getDb } from "@/db";
import { articles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ArticleReadingClient } from "@/components/articles/article-reading-client";

import { getArticleBySlug, getArticleComments } from "@/lib/articles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let articleTitle = "Article";
  let articleSummary = "Read the latest reporting from FTN News.";
  let coverImageUrl: string | undefined = undefined;

  try {
    const d1 = (process.env as any).DB as D1Database;
    if (d1) {
      const db = getDb(d1);
      const article = await getArticleBySlug(db, slug);
      if (article) {
        articleTitle = article.title;
        articleSummary = article.summary || articleSummary;
        if (article.coverImageUrl && article.coverImageUrl.trim().length > 0) {
          coverImageUrl = article.coverImageUrl.trim();
        }
      }
    }
  } catch {}

  const meta: Metadata = {
    title: articleTitle,
    description: articleSummary,
    openGraph: {
      title: `${articleTitle} | FTN News`,
      description: articleSummary,
      type: "article",
      siteName: "FTN News",
      ...(coverImageUrl ? { images: [{ url: coverImageUrl, alt: articleTitle }] } : {}),
    },
    twitter: {
      card: coverImageUrl ? "summary_large_image" : "summary",
      title: `${articleTitle} | FTN News`,
      description: articleSummary,
      ...(coverImageUrl ? { images: [coverImageUrl] } : {}),
    },
    other: {
      "theme-color": "#e2162b",
    },
  };

  return meta;
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let article: any = null;
  let comments: any[] = [];

  try {
    const d1 = (process.env as any).DB as D1Database;
    if (d1) {
      const db = getDb(d1);
      const matched = await getArticleBySlug(db, slug);
      if (matched) {
        article = matched;
        comments = await getArticleComments(db, matched.id);
      }
    }
  } catch (err) {
    console.error("Server fetch article error:", err);
  }

  return (
    <ArticleReadingClient
      slug={slug}
      initialArticle={article}
      initialComments={comments}
    />
  );
}
