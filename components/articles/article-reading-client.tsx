"use client";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import { fetchSession } from "@/lib/session-client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatTimeAgo, calculateReadingTime } from "@/lib/utils";
import { gsCategory } from "@/components/gs/story";
import { sanitizeHtml } from "@/lib/sanitize";
import { canPublishArticles } from "@/lib/rbac";
import {
  Share2,
  Check,
  Trash2,
  ArrowLeft,
  Lock,
  Edit3,
} from "lucide-react";

export function ArticleReadingClient({
  slug,
  initialArticle,
  initialComments = [],
}: {
  slug: string;
  initialArticle?: any;
  initialComments?: any[];
}) {
  const [article, setArticle] = useState<any>(initialArticle || null);
  const [comments, setComments] = useState<any[]>(initialComments || []);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [loading, setLoading] = useState(!initialArticle);

  // 1. Fetch current user session
  useEffect(() => {
    fetchSession()
      .then((data: any) => {
        if (data && data.authenticated && data.user) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  // 2. Fetch article data and comments if not provided initially
  const fetchArticleAndComments = () => {
    if (!slug) return;
    if (!article) setLoading(true);
    fetch(`/api/articles/${slug}`)
      .then((res) => res.json())
      .then((data: any) => {
        if (data && data.article) {
          setArticle(data.article);
          fetchComments();
        } else {
          setArticle(null);
        }
      })
      .catch(() => {
        if (!initialArticle) setArticle(null);
      })
      .finally(() => setLoading(false));
  };

  const fetchComments = () => {
    fetch(`/api/articles/${slug}/comments`)
      .then((res) => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.comments)) {
          setComments(data.comments);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!initialArticle) {
      fetchArticleAndComments();
    }
  }, [slug, initialArticle]);

  const handleShare = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || submittingComment) return;

    setSubmittingComment(true);
    setCommentError(null);

    try {
      const res = await fetch(`/api/articles/${slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });

      const data = (await res.json()) as any;

      if (res.ok) {
        setCommentText("");
        fetchArticleAndComments();
      } else {
        setCommentError(data.error || "Failed to post comment");
      }
    } catch {
      setCommentError("Network error posting comment");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!await confirmDialog("Are you sure you want to delete this comment?")) return;

    try {
      const res = await fetch(`/api/articles/${slug}/comments?commentId=${commentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setComments(comments.filter((c) => c.id !== commentId));
      } else {
        toast("Failed to delete comment");
      }
    } catch {
      toast("Error deleting comment");
    }
  };

  const isAdmin = currentUser?.roles?.some(
    (r: string) => r === "site_admin" || r === "manager"
  );
  const canEditArticle = currentUser && canPublishArticles(currentUser.roles);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center text-sm text-neutral-500">
        Loading story...
      </div>
    );
  }

  if (!article) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-24 text-center space-y-4">
        <h1 className="text-4xl font-extrabold">Story not found</h1>
        <p className="text-sm text-neutral-500">
          The article you are looking for may have been archived, unpublished, or removed.
        </p>
        <Link href="/">
          <Button size="sm" className="mt-2 h-10 px-6 text-sm">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Return to News
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <article className="text-neutral-900 dark:text-white">
      {/* Gold headline band; the cover image overlaps its bottom edge */}
      <header className="bg-brand text-brand-ink">
        <div className={`mx-auto max-w-4xl px-4 pt-8 sm:px-8 ${article.coverImageUrl ? "pb-28 sm:pb-40" : "pb-12 sm:pb-16"}`}>
          <div className="mb-8 flex items-center justify-between gap-4">
            <Link href="/articles" className="inline-flex items-center gap-1.5 text-sm font-bold hover:underline">
              <ArrowLeft className="h-4 w-4" /> All stories
            </Link>
            <div className="flex items-center gap-2">
              {canEditArticle && (
                <Link
                  href={`/admin/articles?edit=${encodeURIComponent(article.slug)}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-brand-ink/80 px-4 text-xs font-bold hover:bg-brand-ink/10"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Edit story
                </Link>
              )}
              <button
                onClick={handleShare}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[#16110a] px-4 text-xs font-bold text-[#fff8e6] hover:bg-black"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Link copied
                  </>
                ) : (
                  <>
                    <Share2 className="h-3.5 w-3.5" /> Share
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mb-4 text-xs font-bold uppercase tracking-widest opacity-75">
            {gsCategory(article.category) ? `${article.category} · ` : ""}
            {calculateReadingTime(article.content)}
          </div>
          <h1 className="text-4xl font-extrabold leading-[0.98] sm:text-6xl lg:text-7xl">{article.title}</h1>
          {article.summary && <p className="mt-5 max-w-2xl text-lg opacity-85 sm:text-xl">{article.summary}</p>}

          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-bold">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#16110a] text-xs text-[#fff8e6]">
              {article.authorAvatar ? (
                <img src={article.authorAvatar} alt={article.authorUsername || "Author"} className="h-full w-full object-cover" />
              ) : (
                (article.authorUsername || "FTN").slice(0, 2).toUpperCase()
              )}
            </span>
            <span>
              By{" "}
              {article.authorUsername ? (
                <Link href={`/articles?author=${encodeURIComponent(article.authorUsername)}`} className="underline decoration-2 underline-offset-4">
                  {article.authorUsername}
                </Link>
              ) : (
                article.authorName || "Staff"
              )}
            </span>
            <span suppressHydrationWarning className="opacity-75">
              {formatDate(article.publishedAt || article.createdAt)}
            </span>
          </div>
        </div>
      </header>

      {article.coverImageUrl && (
        <div className="mx-auto -mt-20 max-w-5xl px-4 sm:-mt-32 sm:px-8">
          <img
            src={article.coverImageUrl}
            alt={article.title}
            className="aspect-[16/8] w-full rounded-[1.75rem] object-cover shadow-2xl shadow-black/30"
          />
        </div>
      )}

      {/* Body */}
      <div className="mx-auto max-w-[44rem] px-4 sm:px-8">
        <div className="article-prose pb-10 pt-10" dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }} />

        <section className="border-t-4 border-brand pb-16 pt-8">
          <h2 className="mb-6 text-3xl font-extrabold">Reader discussion ({comments.length})</h2>

          {currentUser ? (
            <form onSubmit={handlePostComment} className="space-y-3">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Share your perspective (max 500 characters)..."
                rows={3}
                maxLength={500}
                className="rounded-2xl bg-white text-sm dark:bg-neutral-900"
              />
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-neutral-500">{commentText.length} / 500</span>
                <Button type="submit" size="sm" disabled={submittingComment || !commentText.trim()} className="h-10 cursor-pointer px-6 text-sm">
                  {submittingComment ? "Posting..." : "Post comment"}
                </Button>
              </div>
              {commentError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300">
                  {commentError}
                </div>
              )}
            </form>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-3xl bg-[#16110a] p-6 text-[#fff8e6] dark:bg-black sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-lg font-bold">
                  <Lock className="h-4 w-4" /> Sign in to join the discussion
                </div>
                <p className="text-sm opacity-70">You must be logged in to post comments on FTN articles.</p>
              </div>
              <a href={`/api/auth/roblox?returnUrl=/articles/${slug}`}>
                <Button size="sm" className="h-10 cursor-pointer px-6 text-sm">
                  Sign in
                </Button>
              </a>
            </div>
          )}

          <div className="mt-8 divide-y divide-neutral-200 dark:divide-neutral-800">
            {comments.length === 0 ? (
              <p className="py-6 text-sm text-neutral-500">No comments yet. Be the first to join the conversation!</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="flex gap-3 py-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-800 dark:bg-neutral-800 dark:text-white">
                    {c.userAvatar ? <img src={c.userAvatar} alt="" className="h-full w-full object-cover" /> : (c.userName || "U").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="font-bold">{c.userName}</span>
                        <span className="ml-1.5 text-neutral-500 dark:text-neutral-400">@{c.userUsername}</span>
                        <span suppressHydrationWarning className="ml-2 text-neutral-500">{formatTimeAgo(c.createdAt)}</span>
                      </div>
                      {currentUser && (currentUser.id === c.userId || currentUser.robloxUsername?.toLowerCase() === c.userUsername?.toLowerCase() || isAdmin) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(c.id)}
                          className="cursor-pointer p-1 text-neutral-400 transition hover:text-red-500"
                          title={currentUser?.id === c.userId ? "Delete your comment" : "Delete comment (staff)"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">{c.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
