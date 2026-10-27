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
import { AdminPageHeader, AdminTab } from "@/components/gs/admin-header";
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
    <div className="mx-auto max-w-6xl space-y-8 text-neutral-900 dark:text-white">
      <AdminPageHeader
        title="Articles"
        description="Create, edit, and publish stories and news investigations."
        actions={
          <Button size="sm" onClick={handleNewStory} className="h-10 cursor-pointer gap-1.5 px-5 text-sm">
            <Plus className="h-4 w-4" /> New story
          </Button>
        }
        tabs={
          <>
            <AdminTab active={activeTab === "list"} onClick={handleBackToList}>
              All stories ({articlesList.length})
            </AdminTab>
            {editingArticle && (
              <AdminTab
                active={activeTab === "history"}
                onClick={() => {
                  setActiveTab("history");
                  if (editingArticle.slug) fetchRevisions(editingArticle.slug);
                }}
              >
                Version history
              </AdminTab>
            )}
            {activeTab === "create" && <AdminTab active>{editingArticle ? "Editing" : "New story"}</AdminTab>}
          </>
        }
      />

      {activeTab === "create" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-2xl font-extrabold text-neutral-900 dark:text-white">
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
                  <History className="h-3.5 w-3.5 text-brand-text" /> Version History
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
              <div className="text-xs font-mono uppercase text-brand-text font-bold">
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
            <div className="p-12 text-center rounded-[1.75rem] border-0 bg-white dark:bg-neutral-900 space-y-3 shadow-sm dark:shadow-none">
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
                  className="p-5 rounded-[1.75rem] border-0 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 transition space-y-3"
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
            <div className="p-12 text-center rounded-[1.75rem] border-0 bg-white dark:bg-neutral-900 space-y-3 shadow-sm dark:shadow-none">
              <Newspaper className="h-8 w-8 text-neutral-400 dark:text-neutral-600 mx-auto" />
              <div className="text-sm font-bold text-neutral-900 dark:text-white">No articles published yet</div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto">
                Start by composing your first news investigation or opinion piece.
              </p>
              <Button
                onClick={handleNewStory}
                size="sm"
                className="mt-2 text-xs bg-brand hover:bg-brand-hover text-brand-ink font-bold cursor-pointer shadow-sm"
              >
                Compose First Story
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 border-y border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {articlesList.map((art) => (
                <div key={art.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="font-bold uppercase tracking-widest text-brand-text">{art.category}</span>
                      <span
                        className={`inline-flex items-center gap-1.5 font-bold capitalize ${
                          art.status === "published" ? "text-emerald-700 dark:text-emerald-400" : art.status === "archived" ? "text-neutral-500" : "text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${art.status === "published" ? "bg-emerald-500" : art.status === "archived" ? "bg-neutral-400" : "bg-amber-500"}`}
                        />
                        {art.status}
                      </span>
                      <span className="text-neutral-500">{formatDate(art.createdAt)}</span>
                      {(art.authorUsername || art.authorName) && (
                        <span className="text-neutral-500">@{art.authorUsername || art.authorName}</span>
                      )}
                    </div>
                    <h3 className="text-xl font-bold leading-tight">{art.title}</h3>
                    {art.summary && <p className="line-clamp-1 text-sm text-neutral-600 dark:text-neutral-400">{art.summary}</p>}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-1">
                    <Button variant="ghost" size="sm" onClick={() => handleStartEdit(art)} className="cursor-pointer gap-1.5 font-bold">
                      <Edit3 className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenHistory(art)} className="cursor-pointer gap-1.5">
                      <History className="h-3.5 w-3.5" /> History
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleToggleArchive(art)} className="cursor-pointer gap-1.5" title={art.status === "archived" ? "Unarchive and publish story" : "Archive and hide from public view"}>
                      {art.status === "archived" ? (
                        <>
                          <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
                        </>
                      ) : (
                        <>
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </>
                      )}
                    </Button>
                    <Link href={`/articles/${art.slug}`} target="_blank">
                      <Button variant="ghost" size="sm" className="cursor-pointer gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" /> View
                      </Button>
                    </Link>
                  </div>
                </div>
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
