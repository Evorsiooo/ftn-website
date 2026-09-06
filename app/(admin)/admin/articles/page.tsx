"use client";
import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RichTextEditor, ArticleData } from "@/components/editor/rich-text-editor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Plus,
  Edit3,
  ExternalLink,
  Newspaper,
  History,
  RotateCcw,
  User,
  Clock,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { formatDate, formatTimeAgo } from "@/lib/utils";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canPublishArticles } from "@/lib/rbac";

function AdminArticlesContent() {
  const searchParams = useSearchParams();
  const editSlugParam = searchParams.get("edit") || searchParams.get("slug");
  const initialParamHandled = useRef(false);

  const [activeTab, setActiveTab] = useState<"list" | "create" | "history">("list");
  const [articlesList, setArticlesList] = useState<any[]>([]);
  const [editingArticle, setEditingArticle] = useState<ArticleData | null>(null);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [revertingRevisionId, setRevertingRevisionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchArticles = () => {
    setLoading(true);
    fetch("/api/articles?admin=true")
      .then((res) => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.articles)) {
          setArticlesList(data.articles);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  // Handle direct edit URL param only once on initial mount
  useEffect(() => {
    if (editSlugParam && articlesList.length > 0 && !initialParamHandled.current) {
      initialParamHandled.current = true;
      const match = articlesList.find(
        (a) => a.slug === editSlugParam || a.id === editSlugParam
      );
      if (match) {
        handleStartEdit(match);
      }
    }
  }, [editSlugParam, articlesList]);

  const handleBackToList = () => {
    setEditingArticle(null);
    setActiveTab("list");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/admin/articles");
    }
  };

  const fetchRevisions = (slug: string) => {
    setLoadingRevisions(true);
    fetch(`/api/articles/${encodeURIComponent(slug)}/revisions`)
      .then((res) => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.revisions)) {
          setRevisions(data.revisions);
        } else {
          setRevisions([]);
        }
      })
      .catch(() => setRevisions([]))
      .finally(() => setLoadingRevisions(false));
  };

  const handleSaveArticle = async (articleData: ArticleData) => {
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(articleData),
      });

      const data = (await res.json()) as any;
      if (res.ok) {
        alert(
          articleData.id
            ? "Story successfully updated!"
            : "New story created and published!"
        );
        handleBackToList();
        fetchArticles();
      } else {
        alert(`Error saving story: ${data.error || "Unknown error"}`);
      }
    } catch (e: any) {
      alert("Network error while saving article.");
    }
  };

  const handleStartEdit = (art: any) => {
    setEditingArticle({
      id: art.id,
      slug: art.slug,
      title: art.title,
      content: art.content || "",
      summary: art.summary,
      category: art.category,
      coverImageUrl: art.coverImageUrl,
      status: art.status,
    });
    setActiveTab("create");
  };

  const handleOpenHistory = (art: any) => {
    setEditingArticle({
      id: art.id,
      slug: art.slug,
      title: art.title,
      content: art.content || "",
      summary: art.summary,
      category: art.category,
      coverImageUrl: art.coverImageUrl,
      status: art.status,
    });
    setActiveTab("history");
    fetchRevisions(art.slug);
  };

  const handleToggleArchive = async (art: any) => {
    const nextStatus = art.status === "archived" ? "published" : "archived";
    const confirmMsg =
      art.status === "archived"
        ? `Unarchive and publish "${art.title}" back to the public website?`
        : `Archive "${art.title}"? This will hide the story from public view.`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/articles/${encodeURIComponent(art.slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        fetchArticles();
      } else {
        const data = (await res.json().catch(() => ({}))) as any;
        alert(`Failed to update status: ${data?.error || "Unknown error"}`);
      }
    } catch {
      alert("Network error updating status.");
    }
  };

  const handleRevertToRevision = async (rev: any) => {
    if (!editingArticle?.slug) return;
    const confirmRevert = confirm(
      `Are you sure you want to revert to Version ${rev.versionNumber}? This will restore the content and settings from ${formatDate(rev.createdAt)}.`
    );
    if (!confirmRevert) return;

    setRevertingRevisionId(rev.id);
    try {
      const res = await fetch(`/api/articles/${encodeURIComponent(editingArticle.slug)}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: rev.id }),
      });

      const data = (await res.json()) as any;
      if (res.ok) {
        alert(`Successfully reverted to Version ${rev.versionNumber}!`);
        setEditingArticle({
          id: data.article.id,
          slug: editingArticle.slug,
          title: data.article.title,
          content: data.article.content,
          summary: data.article.summary,
          category: data.article.category,
          coverImageUrl: data.article.coverImageUrl,
          status: data.article.status,
        });
        setActiveTab("create");
        fetchArticles();
      } else {
        alert(`Revert failed: ${data.error || "Unknown error"}`);
      }
    } catch {
      alert("Network error while reverting article.");
    } finally {
      setRevertingRevisionId(null);
    }
  };

  const handleNewStory = () => {
    setEditingArticle(null);
    setActiveTab("create");
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 sm:px-8 py-10 space-y-8 text-neutral-900 dark:text-white">
      {/* Top Header with Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white flex items-center gap-2.5">
            <Newspaper className="h-7 w-7 text-blue-600 dark:text-blue-400" /> Articles
          </h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeTab === "list" ? "default" : "outline"}
            size="sm"
            onClick={handleBackToList}
            className="text-xs cursor-pointer"
          >
            All Articles ({articlesList.length})
          </Button>

          {editingArticle && (
            <Button
              variant={activeTab === "history" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActiveTab("history");
                if (editingArticle.slug) fetchRevisions(editingArticle.slug);
              }}
              className="text-xs gap-1.5 cursor-pointer"
            >
              <History className="h-3.5 w-3.5 text-[#00a9d2]" /> Version History
            </Button>
          )}

          <Button
            variant={activeTab === "create" && !editingArticle ? "default" : "outline"}
            size="sm"
            onClick={handleNewStory}
            className="text-xs gap-1.5 bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold cursor-pointer shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> New Story
          </Button>
        </div>
      </div>

      {activeTab === "create" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                {editingArticle ? `Edit Story: ${editingArticle.title}` : "Compose New Story"}
              </h2>
              {editingArticle && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Changes will be automatically recorded in version history.
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {editingArticle?.slug && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenHistory(editingArticle)}
                  className="text-xs gap-1.5 border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-white cursor-pointer"
                >
                  <History className="h-3.5 w-3.5 text-[#00a9d2]" /> Version History
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackToList}
                className="text-xs border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-white cursor-pointer"
              >
                Cancel
              </Button>
            </div>
          </div>

          <RichTextEditor
            initialArticle={editingArticle}
            onSave={handleSaveArticle}
            onCancel={handleBackToList}
          />
        </div>
      ) : activeTab === "history" && editingArticle ? (
        /* Version History Drawer / Tab */
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-4">
            <div>
              <div className="text-xs font-mono uppercase text-[#00a9d2] font-bold">
                Version History
              </div>
              <h2 className="text-2xl font-black text-neutral-900 dark:text-white">{editingArticle.title}</h2>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab("create")}
              className="text-xs border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-white cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Editor
            </Button>
          </div>

          {loadingRevisions ? (
            <div className="p-12 text-center text-xs text-neutral-500 dark:text-neutral-400">Loading version snapshots...</div>
          ) : revisions.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 space-y-3 shadow-sm dark:shadow-none">
              <History className="h-8 w-8 text-neutral-400 dark:text-neutral-600 mx-auto" />
              <div className="text-sm font-bold text-neutral-900 dark:text-white">No historical versions recorded yet</div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                Snapshots are automatically created each time this article is updated or published.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {revisions.map((rev, idx) => (
                <Card
                  key={rev.id}
                  className="p-5 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none hover:border-neutral-300 dark:hover:border-neutral-700 transition space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-900 pb-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-mono font-black text-xs">
                        v{rev.versionNumber}
                      </div>

                      {rev.revertedFromVersion && (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-bold text-[11px] flex items-center gap-1">
                          <RotateCcw className="h-3 w-3" /> Reverted to v{rev.revertedFromVersion}
                        </span>
                      )}

                      {idx === 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-bold text-[10px]">
                          CURRENT VERSION
                        </span>
                      )}

                      <span className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-neutral-400 dark:text-neutral-500" />
                        {formatDate(rev.createdAt)} ({formatTimeAgo(rev.createdAt)})
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                        {rev.editorAvatar ? (
                          <img
                            src={rev.editorAvatar}
                            alt=""
                            className="h-5 w-5 rounded-full object-cover"
                          />
                        ) : (
                          <User className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                        )}
                        <span>
                          By <strong className="text-neutral-800 dark:text-neutral-200">@{rev.editorUsername || "Staff"}</strong>
                        </span>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        disabled={revertingRevisionId === rev.id || idx === 0}
                        onClick={() => handleRevertToRevision(rev)}
                        className={`text-xs gap-1 cursor-pointer ${
                          idx === 0
                            ? "opacity-50 cursor-not-allowed border-neutral-200 dark:border-neutral-800 text-neutral-400"
                            : "border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-white"
                        }`}
                      >
                        <RotateCcw className="h-3 w-3" />
                        {revertingRevisionId === rev.id ? "Reverting..." : "Revert to Version"}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5 pl-2 border-l-2 border-neutral-200 dark:border-neutral-800">
                    <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 uppercase font-mono font-bold">
                      <span>{rev.category}</span>
                      <span>•</span>
                      <span
                        className={
                          rev.status === "published"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : rev.status === "archived"
                            ? "text-neutral-500 dark:text-neutral-400"
                            : "text-amber-600 dark:text-amber-400"
                        }
                      >
                        {rev.status}
                      </span>
                    </div>

                    <h4 className="text-base font-bold text-neutral-900 dark:text-white">{rev.title}</h4>
                    {rev.summary && (
                      <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-2">{rev.summary}</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* All Articles Table / Grid */
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-xs text-neutral-500 dark:text-neutral-400">Loading articles...</div>
          ) : articlesList.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 space-y-3 shadow-sm dark:shadow-none">
              <Newspaper className="h-8 w-8 text-neutral-400 dark:text-neutral-600 mx-auto" />
              <div className="text-sm font-bold text-neutral-900 dark:text-white">No articles published yet</div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                Start by composing your first news investigation or opinion piece.
              </p>
              <Button
                onClick={handleNewStory}
                size="sm"
                className="mt-2 text-xs bg-[#00a9d2] hover:bg-[#0090b3] text-white font-bold cursor-pointer shadow-sm"
              >
                Compose First Story
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {articlesList.map((art) => (
                <Card
                  key={art.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none hover:border-neutral-300 dark:hover:border-neutral-700 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                      <span className="uppercase font-mono text-[10px] text-neutral-500 dark:text-neutral-400 font-bold">
                        {art.category}
                      </span>
                      <span>•</span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          art.status === "published"
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/60"
                            : art.status === "archived"
                            ? "bg-neutral-100 text-neutral-600 border border-neutral-300 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-700"
                            : "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800/60"
                        }`}
                      >
                        {art.status}
                      </span>
                      <span>•</span>
                      <span className="text-[10px] text-neutral-500">
                        {formatDate(art.createdAt)}
                      </span>
                      {(art.authorUsername || art.authorName) && (
                        <>
                          <span>•</span>
                          <span className="text-[10px] text-neutral-600 dark:text-neutral-300">
                            By @{art.authorUsername || art.authorName}
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="font-bold text-base text-neutral-900 dark:text-white">{art.title}</h3>
                    {art.summary && (
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-1">{art.summary}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleArchive(art)}
                      className={`text-xs gap-1 border-neutral-300 hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800 cursor-pointer ${
                        art.status === "archived"
                          ? "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                          : "text-neutral-600 hover:text-amber-600 dark:text-neutral-400 dark:hover:text-amber-400"
                      }`}
                      title={art.status === "archived" ? "Unarchive & publish story" : "Archive & hide from public view"}
                    >
                      {art.status === "archived" ? (
                        <>
                          <ArchiveRestore className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Unarchive
                        </>
                      ) : (
                        <>
                          <Archive className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" /> Archive
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenHistory(art)}
                      className="text-xs gap-1 border-neutral-300 hover:bg-neutral-100 text-neutral-700 dark:border-neutral-800 dark:hover:bg-neutral-800 dark:text-neutral-300 cursor-pointer"
                      title="View Version History"
                    >
                      <History className="h-3.5 w-3.5 text-[#00a9d2]" /> History
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartEdit(art)}
                      className="text-xs gap-1 border-neutral-300 hover:bg-neutral-100 text-neutral-700 dark:border-neutral-800 dark:hover:bg-neutral-800 dark:text-neutral-200 cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Edit
                    </Button>

                    <Link href={`/articles/${art.slug}`} target="_blank">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1 border-neutral-300 hover:bg-neutral-100 text-neutral-700 dark:border-neutral-800 dark:hover:bg-neutral-800 dark:text-neutral-200 cursor-pointer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> View
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminArticlesConsole() {
  return (
    <AdminAuthGuard requiredPermission={canPublishArticles} featureTitle="Articles & Publishing Console">
      <Suspense fallback={<div className="p-8 text-center text-xs text-neutral-400">Loading editor...</div>}>
        <AdminArticlesContent />
      </Suspense>
    </AdminAuthGuard>
  );
}
