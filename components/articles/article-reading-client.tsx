"use client";
import { fetchSession } from "@/lib/session-client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { TracingBeam } from "@/components/ui/tracing-beam";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatTimeAgo, calculateReadingTime } from "@/lib/utils";
import { sanitizeHtml } from "@/lib/sanitize";
import { canPublishArticles } from "@/lib/rbac";
import {
  Share2,
  Check,
  Trash2,
  Sparkles,
  Clock,
  ArrowLeft,
  MessageSquare,
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
    if (!confirm("Are you sure you want to delete this comment?")) return;

    try {
      const res = await fetch(`/api/articles/${slug}/comments?commentId=${commentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setComments(comments.filter((c) => c.id !== commentId));
      } else {
        alert("Failed to delete comment");
      }
    } catch {
      alert("Error deleting comment");
    }
  };

  const isAdmin = currentUser?.roles?.some(
    (r: string) => r === "site_admin" || r === "manager"
  );
  const canEditArticle = currentUser && canPublishArticles(currentUser.roles);

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-20 text-center text-xs text-neutral-400">
        Loading story...
      </div>
    );
  }

  if (!article) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-24 text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">Story Not Found</h1>
        <p className="text-xs text-neutral-400">
          The article you are looking for may have been archived, unpublished, or removed.
        </p>
        <Link href="/">
          <Button variant="outline" size="sm" className="mt-2 text-xs border-neutral-800">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Return to News
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 sm:px-8 pt-24 sm:pt-28 pb-12 text-neutral-900 dark:text-white">
      {/* Back and Action Bar */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to News
        </Link>

        <div className="flex items-center gap-2">
          {/* Edit Story Quick Link for Staff */}
          {canEditArticle && (
            <Link href={`/admin/articles?edit=${encodeURIComponent(article.slug)}`}>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 border-neutral-300 bg-white text-[#00a9d2] hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-[#00a9d2] dark:hover:text-white cursor-pointer font-bold"
              >
                <Edit3 className="h-3.5 w-3.5" /> Edit Story
              </Button>
            </Link>
          )}

          {/* Share Button */}
          <Button
            onClick={handleShare}
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:text-white cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" /> Link Copied!
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" /> Share Story
              </>
            )}
          </Button>
        </div>
      </div>

      <TracingBeam className="px-6">
        <article className="space-y-8">
          {/* Header & Cover Photo Hero Container */}
          <div
            className={`relative rounded-3xl overflow-hidden border border-neutral-800 p-6 sm:p-10 flex flex-col justify-end ${
              article.coverImageUrl
                ? "min-h-[380px] bg-neutral-950"
                : "bg-neutral-950"
            }`}
          >
            {/* Background Cover Image with Gradient Overlay */}
            {article.coverImageUrl && (
              <div className="absolute inset-0 z-0">
                <img
                  src={article.coverImageUrl}
                  alt={article.title}
                  className="h-full w-full object-cover object-center filter brightness-[0.4] contrast-[1.05]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/30" />
              </div>
            )}

            {/* Header Content on Top of Hero */}
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2">
                <span className="uppercase font-mono text-[11px] font-bold px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-neutral-700 text-neutral-200">
                  {article.category}
                </span>
                <span className="text-neutral-500">•</span>
                <span className="flex items-center gap-1 text-xs text-neutral-300 font-medium px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm">
                  <Clock className="h-3 w-3 text-neutral-400" />
                  {calculateReadingTime(article.content)}
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight drop-shadow-md">
                {article.title}
              </h1>

              {/* Author Bar with Roblox Avatar */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-700/60 pt-4 text-xs text-neutral-300">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center font-bold text-xs text-white shrink-0 border border-neutral-700">
                    {article.authorAvatar ? (
                      <img
                        src={article.authorAvatar}
                        alt={article.authorUsername || "Author"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (article.authorUsername || "FTN").slice(0, 2).toUpperCase()
                    )}
                  </div>

                  <div>
                    <div className="text-neutral-200">
                      Reported by{" "}
                      {article.authorUsername ? (
                        <Link
                          href={`/articles?author=${encodeURIComponent(article.authorUsername)}`}
                          className="font-bold text-white hover:text-[#00a9d2] underline transition"
                        >
                          {article.authorUsername}
                        </Link>
                      ) : (
                        <span className="font-bold text-white">{article.authorName || "Staff"}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div suppressHydrationWarning className="text-neutral-400 font-medium">
                  Published {formatDate(article.publishedAt || article.createdAt)}
                </div>
              </div>
            </div>
          </div>

          {/* Article Body Content (Render Sanitized TipTap HTML) */}
          <div
            className="article-prose pt-4 pb-8"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }}
          />

          {/* Article Discussion & Comments Section */}
          <section className="border-t border-neutral-200 dark:border-neutral-800 pt-10 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Reader Discussion ({comments.length})
              </h3>
            </div>

            {/* Comment Form */}
            {currentUser ? (
              <form onSubmit={handlePostComment} className="space-y-3">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Share your perspective (Max 500 characters)..."
                  rows={3}
                  maxLength={500}
                  className="bg-white border-neutral-300 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-white text-xs"
                />

                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500 font-mono">
                    {commentText.length} / 500
                  </span>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submittingComment || !commentText.trim()}
                    className="bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold text-xs cursor-pointer"
                  >
                    {submittingComment ? "Posting..." : "Post Comment"}
                  </Button>
                </div>

                {commentError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/60 dark:border-red-800 dark:text-red-300 p-2.5 text-xs">
                    {commentError}
                  </div>
                )}
              </form>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/40 p-6 text-center space-y-3 shadow-sm dark:shadow-none">
                <Lock className="h-6 w-6 text-neutral-400 dark:text-neutral-500 mx-auto" />
                <div className="text-sm font-bold text-neutral-900 dark:text-white">Sign in to participate</div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                  You must be logged in to post comments on FTN articles.
                </p>
                <a href={`/api/auth/roblox?returnUrl=/articles/${slug}`}>
                  <Button size="sm" className="text-xs bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold cursor-pointer">
                    Sign In
                  </Button>
                </a>
              </div>
            )}

            {/* Comments Stream */}
            <div className="space-y-3 pt-4">
              {comments.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-500 rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-900 dark:bg-neutral-950">
                  No comments yet. Be the first to join the conversation!
                </div>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none p-4 space-y-2 relative group"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-white overflow-hidden flex items-center justify-center font-bold text-[10px]">
                          {c.userAvatar ? (
                            <img src={c.userAvatar} alt="" className="h-full w-full object-cover" />
                          ) : (
                            (c.userName || "U").slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <span className="font-bold text-neutral-900 dark:text-white">{c.userName}</span>
                          <span className="text-[11px] text-neutral-500 dark:text-neutral-400 ml-1.5">@{c.userUsername}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span suppressHydrationWarning className="text-[11px] text-neutral-500">{formatTimeAgo(c.createdAt)}</span>
                        {currentUser && (currentUser.id === c.userId || currentUser.robloxUsername?.toLowerCase() === c.userUsername?.toLowerCase() || isAdmin) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(c.id)}
                            className="text-neutral-400 hover:text-red-500 transition cursor-pointer p-1"
                            title={currentUser?.id === c.userId ? "Delete your comment" : "Delete Comment (Staff)"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed pl-9">
                      {c.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </article>
      </TracingBeam>
    </div>
  );
}
