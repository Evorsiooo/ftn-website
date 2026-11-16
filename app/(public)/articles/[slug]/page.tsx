export const runtime = "edge";
import React from "react";
import type { Metadata } from "next";
import { STATIC_CARDS, absoluteUrl, articleCard, existingCardUrl, type CardSpec } from "@/lib/og/cards";
import { shareMeta } from "@/lib/og/meta";
import { getDb } from "@/db";
import { articles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ArticleReadingClient } from "@/components/articles/article-reading-client";

import { getArticleBySlug, getArticleComments } from "@/lib/articles";

import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/auth";
import { canPublishArticles } from "@/lib/rbac";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let articleTitle = "Article";
  let articleSummary = "Read the latest reporting from FTN News.";
  let coverImageUrl: string | undefined = undefined;
  let card: CardSpec | null = null;

  try {
    const d1 = (process.env as any).DB as D1Database;
    if (d1) {
      const db = getDb(d1);
      const article = await getArticleBySlug(db, slug);
      if (article) {
        if (article.status !== "published") {
          const cookieStore = await cookies();
          const token = cookieStore.get("ftn_session")?.value;
          const user = token ? await verifySessionToken(token) : null;
          if (!user || !canPublishArticles(user.roles)) {
            return {
              title: "Article Not Found | FTN News",
              description: "The requested article could not be found.",
            };
          }
        }
        articleTitle = article.title;
        if (article.status === "published") card = articleCard(article);
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
    // The article's own card once it is drawn; until then its cover, or the Articles card.
    ...shareMeta({
      title: `${articleTitle} | FTN News`,
      description: articleSummary,
      siteName: "FTN News",
      type: "article",
      image: (await existingCardUrl(card)) || absoluteUrl(coverImageUrl) || STATIC_CARDS.articles,
      imageAlt: articleTitle,
    }),
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
        let isAllowed = true;
        if (matched.status !== "published") {
          const cookieStore = await cookies();
          const token = cookieStore.get("ftn_session")?.value;
          const user = token ? await verifySessionToken(token) : null;
          if (!user || !canPublishArticles(user.roles)) {
            // Treat draft or archived articles as not found for non-editorial users
            isAllowed = false;
          }
        }
        if (isAllowed) {
          article = matched;
          comments = await getArticleComments(db, matched.id);
        }
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
