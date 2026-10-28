"use client";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RichTextEditor, ArticleData } from "@/components/editor/rich-text-editor";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  const [query, setQuery] = useState("");

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

  // "Start article from this tip" hands the lead over through sessionStorage.
  useEffect(() => {
    if (searchParams.get("from") !== "tip") return;
    try {
      const raw = sessionStorage.getItem("ftn_tip_draft");
      sessionStorage.removeItem("ftn_tip_draft");
      if (!raw) return;
      const tip = JSON.parse(raw) as { title: string; content: string };
      setEditingArticle({ title: tip.title, content: tip.content, category: "news", status: "draft" });
      setActiveTab("create");
      window.history.replaceState(null, "", "/admin/articles");
    } catch {}
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
        toast(
          articleData.id
            ? "Story successfully updated!"
            : "New story created and published!"
        );
        handleBackToList();
        fetchArticles();
      } else {
        toast(`Error saving story: ${data.error || "Unknown error"}`);
      }
    } catch (e: any) {
      toast("Network error while saving article.");
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
    if (art.slug) fetchRevisions(art.slug);
  };

  const handleOpenHistory = (art: any) => {
    handleStartEdit(art);
    setTimeout(() => document.getElementById("article-history")?.scrollIntoView({ behavior: "smooth" }), 400);
  };

  const handleToggleArchive = async (art: any) => {
    const nextStatus = art.status === "archived" ? "published" : "archived";
    const confirmMsg =
      art.status === "archived"
        ? `Unarchive and publish "${art.title}" back to the public website?`
        : `Archive "${art.title}"? This will hide the story from public view.`;
    if (!await confirmDialog(confirmMsg)) return;

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
        toast(`Failed to update status: ${data?.error || "Unknown error"}`);
      }
    } catch {
      toast("Network error updating status.");
    }
  };

  const handleRevertToRevision = async (rev: any) => {
    if (!editingArticle?.slug) return;
    const confirmRevert = await confirmDialog(
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
        toast(`Successfully reverted to Version ${rev.versionNumber}!`);
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
        toast(`Revert failed: ${data.error || "Unknown error"}`);
      }
    } catch {
      toast("Network error while reverting article.");
    } finally {
      setRevertingRevisionId(null);
    }
  };

  const handleNewStory = () => {
    setEditingArticle(null);
    setActiveTab("create");
  };

  return (
    <div className="w-full space-y-8 text-neutral-900 dark:text-white">
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

        {editingArticle?.slug && (
        /* Version History Drawer / Tab */
        <div className="space-y-6">
          <div id="article-history" className="border-b border-neutral-200 pb-3 dark:border-neutral-800">
            <h2 className="text-xl font-extrabold">Version history</h2>
            <p className="text-xs text-neutral-500">Every save is kept. Revert to any earlier version.</p>
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
            <div className="space-y-4 border-l-2 border-neutral-200 pl-5 dark:border-neutral-800">
              {revisions.map((rev, idx) => (
                <Card
                  key={rev.id}
                  className="p-5 rounded-[1.75rem] border-0 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 transition space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-900 pb-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="px-2.5 py-1 rounded-full bg-brand/20 border border-brand text-brand-text font-mono font-black text-xs">
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
            <>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stories by title, author or category" className="max-w-md" />
            <div className="grid items-start gap-5 lg:grid-cols-3">
              {([
                { key: "draft", title: "Drafts", note: "Not public yet", dot: "bg-amber-500" },
                { key: "published", title: "Published", note: "Live on the site", dot: "bg-emerald-500" },
                { key: "archived", title: "Archived", note: "Hidden from readers", dot: "bg-neutral-400" },
              ] as const).map((col) => {
                const items = articlesList.filter((a) => (a.status || "draft") === col.key && (!query.trim() || `${a.title} ${a.authorUsername || a.authorName || ""} ${a.category}`.toLowerCase().includes(query.trim().toLowerCase())));
                return (
                  <section key={col.key} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
                    <header className="flex items-center justify-between px-2 pb-3 pt-1">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-extrabold"><span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />{col.title}</div>
                        <div className="text-xs text-neutral-500">{col.note}</div>
                      </div>
                      <span className="rounded-full bg-neutral-200 px-2.5 text-xs font-extrabold dark:bg-neutral-800">{items.length}</span>
                    </header>
                    <div className="space-y-2.5">
                      {items.length === 0 && <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-xs text-neutral-500 dark:border-neutral-700">Empty</div>}
                      {items.map((art) => (
                        <article key={art.id} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-bold uppercase tracking-widest text-brand-text">{art.category === "news" ? "" : art.category}</span>
                            <span className="text-neutral-500">{formatTimeAgo(art.updatedAt || art.createdAt)}</span>
                          </div>
                          <button type="button" onClick={() => handleStartEdit(art)} className="mt-1.5 block w-full cursor-pointer text-left text-base font-bold leading-snug hover:underline">
                            {art.title}
                          </button>
                          {(art.authorUsername || art.authorName) && <div className="mt-1 text-xs text-neutral-500">@{art.authorUsername || art.authorName}</div>}
                          <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-neutral-200 pt-2 dark:border-neutral-800">
                            <Button variant="ghost" size="sm" onClick={() => handleStartEdit(art)} className="h-8 cursor-pointer gap-1 px-2 font-bold">
                              <Edit3 className="h-3.5 w-3.5" /> Edit
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleOpenHistory(art)} className="h-8 cursor-pointer gap-1 px-2" title="Version history">
                              <History className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleToggleArchive(art)} className="h-8 cursor-pointer gap-1 px-2" title={art.status === "archived" ? "Unarchive and publish story" : "Archive and hide from public view"}>
                              {art.status === "archived" ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                            </Button>
                            <Link href={`/articles/${art.slug}`} target="_blank" className="ml-auto">
                              <Button variant="ghost" size="sm" className="h-8 cursor-pointer gap-1 px-2" title="View on site">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
            </>
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
