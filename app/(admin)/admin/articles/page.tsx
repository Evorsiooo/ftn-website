"use client";
import React, { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Archive, ArchiveRestore, ExternalLink, History, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import type { ArticleData } from "@/components/editor/rich-text-editor";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { BackButton, Body, Facts, PageBar, Pill, Screen, Seg, Sheet, ago, formatDay, formatWhen, type Tone } from "@/components/admin/ui";
import { refreshAdminSummary } from "@/lib/admin-summary";
import { canPublishArticles } from "@/lib/rbac";
import { cn } from "@/lib/utils";

// The editor (TipTap) is only needed once an article is opened, so keep it out of the list view's bundle.
const RichTextEditor = dynamic(() => import("@/components/editor/rich-text-editor").then((m) => m.RichTextEditor), {
  ssr: false,
  loading: () => <div className="pane-empty">Loading the editor…</div>,
});

type Filter = "draft" | "published" | "archived" | "all";
const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "amber" },
  published: { label: "Published", tone: "green" },
  archived: { label: "Archived", tone: "grey" },
};
const CATEGORY: Record<string, string> = { news: "News", politics: "Politics", business: "Business", technology: "Technology", entertainment: "Entertainment", opinion: "Opinion" };
const statusOf = (a: any) => STATUS[a.status || "draft"] ?? STATUS.draft;
const author = (a: any) => (a.authorUsername || a.authorName ? `@${a.authorUsername || a.authorName}` : "");

function toEditor(art: any): ArticleData {
  return {
    id: art.id,
    slug: art.slug,
    title: art.title,
    content: art.content || "",
    summary: art.summary,
    category: art.category,
    coverImageUrl: art.coverImageUrl,
    status: art.status,
  };
}

function AdminArticlesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editSlugParam = searchParams.get("edit") || searchParams.get("slug");
  const selectedId = searchParams.get("id");
  const initialParamHandled = useRef(false);

  const [articlesList, setArticlesList] = useState<any[] | null>(null);
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [editingArticle, setEditingArticle] = useState<ArticleData | null>(null);
  const [filter, setFilter] = useState<Filter>("draft");
  const filterTouched = useRef(false);
  const [query, setQuery] = useState("");

  // Version history, in a side panel, for the article being edited or the one picked in the list.
  const [historyOf, setHistoryOf] = useState<{ slug: string; title: string } | null>(null);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [revertingRevisionId, setRevertingRevisionId] = useState<string | null>(null);

  const select = (id: string | null) => router.replace(id ? `/admin/articles?id=${encodeURIComponent(id)}` : "/admin/articles", { scroll: false });

  const fetchArticles = () => {
    fetch("/api/articles?admin=true")
      .then((res) => res.json())
      .then((data: any) => setArticlesList(data && Array.isArray(data.articles) ? data.articles : []))
      .catch(() => setArticlesList([]));
    refreshAdminSummary();
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  // Open on Drafts when there are some, otherwise Published.
  useEffect(() => {
    if (!articlesList || filterTouched.current) return;
    filterTouched.current = true;
    const picked = selectedId ? articlesList.find((a) => a.id === selectedId) : null;
    if (picked) setFilter((picked.status || "draft") as Filter);
    else if (!articlesList.some((a) => (a.status || "draft") === "draft")) setFilter("published");
  }, [articlesList, selectedId]);

  // "Start article from this tip" hands the lead over through sessionStorage.
  useEffect(() => {
    if (searchParams.get("from") !== "tip") return;
    try {
      const raw = sessionStorage.getItem("ftn_tip_draft");
      sessionStorage.removeItem("ftn_tip_draft");
      if (!raw) return;
      const tip = JSON.parse(raw) as { title: string; content: string };
      setEditingArticle({ title: tip.title, content: tip.content, category: "news", status: "draft" });
      setMode("edit");
      window.history.replaceState(null, "", "/admin/articles");
    } catch {}
  }, []);

  // Open the editor from a link (?edit=slug) once.
  useEffect(() => {
    if (editSlugParam && articlesList && articlesList.length > 0 && !initialParamHandled.current) {
      initialParamHandled.current = true;
      const match = articlesList.find((a) => a.slug === editSlugParam || a.id === editSlugParam);
      if (match) handleStartEdit(match);
    }
  }, [editSlugParam, articlesList]);

  const handleBackToList = () => {
    const id = editingArticle?.id;
    setEditingArticle(null);
    setMode("list");
    setHistoryOf(null);
    router.replace(id ? `/admin/articles?id=${encodeURIComponent(id)}` : "/admin/articles", { scroll: false });
  };

  const fetchRevisions = (slug: string) => {
    setLoadingRevisions(true);
    setRevisions([]);
    fetch(`/api/articles/${encodeURIComponent(slug)}/revisions`)
      .then((res) => res.json())
      .then((data: any) => setRevisions(data && Array.isArray(data.revisions) ? data.revisions : []))
      .catch(() => setRevisions([]))
      .finally(() => setLoadingRevisions(false));
  };

  const openHistory = (art: { slug?: string; title: string }) => {
    if (!art.slug) return;
    setHistoryOf({ slug: art.slug, title: art.title });
    fetchRevisions(art.slug);
  };

  const handleSaveArticle = async (articleData: ArticleData) => {
    try {
      const res = await fetch("/api/articles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(articleData) });
      const data = (await res.json()) as any;
      if (res.ok) {
        toast(articleData.status === "draft" ? "Draft saved." : articleData.status === "archived" ? "Story archived." : articleData.id ? "Story updated." : "Story published.");
        const id = articleData.id || data.article?.id || data.id;
        setEditingArticle(null);
        setMode("list");
        setHistoryOf(null);
        filterTouched.current = true;
        setFilter(articleData.status as Filter);
        router.replace(id ? `/admin/articles?id=${encodeURIComponent(id)}` : "/admin/articles", { scroll: false });
        fetchArticles();
      } else toast(`The story could not be saved: ${data.error || "unknown error"}`);
    } catch {
      toast("Network error while saving the story.");
    }
  };

  const handleStartEdit = (art: any) => {
    setEditingArticle(toEditor(art));
    setMode("edit");
    if (art.slug) window.history.replaceState(null, "", `/admin/articles?edit=${encodeURIComponent(art.slug)}`);
  };

  const handleToggleArchive = async (art: any) => {
    const nextStatus = art.status === "archived" ? "published" : "archived";
    const msg = art.status === "archived" ? `Unarchive “${art.title}” and publish it on the site again?` : `Archive “${art.title}”? It will be hidden from readers.`;
    if (!(await confirmDialog(msg, { ok: art.status === "archived" ? "Unarchive" : "Archive" }))) return;
    try {
      const res = await fetch(`/api/articles/${encodeURIComponent(art.slug)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      if (res.ok) fetchArticles();
      else toast(`Failed to update status: ${((await res.json().catch(() => ({}))) as any)?.error || "unknown error"}`);
    } catch {
      toast("Network error updating status.");
    }
  };

  const handleRevertToRevision = async (rev: any) => {
    if (!historyOf) return;
    if (
      !(await confirmDialog(`Go back to version ${rev.versionNumber}? The story's text and settings from ${formatWhen(rev.createdAt, { year: true })} are restored, as a new version.`, {
        ok: "Revert",
      }))
    )
      return;
    setRevertingRevisionId(rev.id);
    try {
      const res = await fetch(`/api/articles/${encodeURIComponent(historyOf.slug)}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: rev.id }),
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        toast(`Back to version ${rev.versionNumber}.`);
        if (mode === "edit" && editingArticle?.slug === historyOf.slug) setEditingArticle({ ...toEditor(data.article), slug: historyOf.slug });
        fetchRevisions(historyOf.slug);
        fetchArticles();
      } else toast(`Revert failed: ${data.error || "unknown error"}`);
    } catch {
      toast("Network error while reverting the story.");
    } finally {
      setRevertingRevisionId(null);
    }
  };

  const handleNewStory = () => {
    setEditingArticle(null);
    setMode("edit");
  };

  const all = articlesList || [];
  const needle = query.trim().toLowerCase();
  const count = (f: Filter) => (f === "all" ? all.length : all.filter((a) => (a.status || "draft") === f).length);
  const visible = useMemo(
    () =>
      all
        .filter((a) => filter === "all" || (a.status || "draft") === filter)
        .filter((a) => !needle || `${a.title} ${a.authorUsername || a.authorName || ""} ${a.category}`.toLowerCase().includes(needle))
        .sort((a, b) => +new Date(b.updatedAt || b.createdAt) - +new Date(a.updatedAt || a.createdAt)),
    [all, filter, needle],
  );
  const picked = selectedId ? (all.find((a) => a.id === selectedId) ?? null) : null;
  const current = picked ?? visible[0] ?? null;

  const filters = (["draft", "published", "archived", "all"] as const).map((f) => ({ value: f, label: f === "all" ? "All" : f === "draft" ? "Drafts" : STATUS[f].label, n: count(f) }));
  const pick = (f: Filter) => {
    filterTouched.current = true;
    setFilter(f);
    select(null);
  };

  const historySheet = historyOf && (
    <Sheet title={`History: ${historyOf.title}`} onClose={() => setHistoryOf(null)}>
      {loadingRevisions ? (
        <div className="empty">Loading versions…</div>
      ) : revisions.length === 0 ? (
        <div className="empty">No earlier versions yet. One is kept each time the story is saved.</div>
      ) : (
        <div className="rows" style={{ display: "grid" }}>
          {revisions.map((rev, idx) => (
            <div key={rev.id} className="r" style={{ alignItems: "flex-start" }}>
              <span className="pill grey num" style={{ flex: "none" }}>
                v{rev.versionNumber}
              </span>
              <span className="grow">
                <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                  {rev.title}
                </span>
                <span className="t12 muted" style={{ display: "block" }}>
                  {formatWhen(rev.createdAt)} · @{rev.editorUsername || "staff"} · {STATUS[rev.status]?.label ?? rev.status}
                  {rev.revertedFromVersion ? ` · back to v${rev.revertedFromVersion}` : ""}
                </span>
                {rev.summary && (
                  <span className="t12 muted" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 2 }}>
                    {rev.summary}
                  </span>
                )}
              </span>
              {idx === 0 ? (
                <Pill tone="green">Current</Pill>
              ) : (
                <button type="button" className="btn sm" disabled={revertingRevisionId === rev.id} onClick={() => handleRevertToRevision(rev)}>
                  <RotateCcw className="ic-sm" />
                  {revertingRevisionId === rev.id ? "Reverting…" : "Revert"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );

  if (mode === "edit") {
    return (
      <Screen>
        <RichTextEditor
          initialArticle={editingArticle}
          onSave={handleSaveArticle}
          onCancel={handleBackToList}
          barActions={
            editingArticle?.slug ? (
              <button type="button" className="btn ghost has-lbl-m" onClick={() => openHistory(editingArticle)} aria-label="History">
                <History className="ic" />
                <span className="lbl-m">History</span>
              </button>
            ) : null
          }
        />
        {historySheet}
      </Screen>
    );
  }

  return (
    <Screen>
      <PageBar
        title="Articles"
        tools={
          <>
            <Seg value={filter} onChange={pick} options={filters} label="Show" />
            <div className="search" style={{ width: 240 }}>
              <Search />
              <input className="input sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, author or category" aria-label="Search stories" />
            </div>
          </>
        }
        end={
          <button type="button" className="btn primary has-lbl-m" onClick={handleNewStory} aria-label="New story">
            <Plus className="ic" />
            <span className="lbl-m">New story</span>
          </button>
        }
        mrow={
          <>
            <select className="select sm" style={{ flex: "none", width: 140 }} value={filter} onChange={(e) => pick(e.target.value as Filter)} aria-label="Show">
              {filters.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label} ({f.n})
                </option>
              ))}
            </select>
            <div className="search" style={{ flex: 1 }}>
              <Search />
              <input className="input sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stories" aria-label="Search stories" />
            </div>
          </>
        }
      />
      <Body>
        <div className={cn("ld", picked && "detail")}>
          <div className="ld-list">
            {articlesList === null ? (
              <div className="empty">Loading stories…</div>
            ) : visible.length === 0 ? (
              <div className="empty">{needle ? "No story matches your search." : all.length === 0 ? "No stories yet. Write the first one with New story." : "Nothing here."}</div>
            ) : (
              visible.map((a) => {
                const st = statusOf(a);
                return (
                  <button key={a.id} type="button" className={cn("item", current?.id === a.id && "on")} onClick={() => select(a.id)}>
                    {a.coverImageUrl ? (
                      <img src={a.coverImageUrl} alt="" className="thumb" style={{ width: 64, height: 36, objectFit: "cover", flex: "none" }} />
                    ) : (
                      <span className="thumb" style={{ width: 64, height: 36, flex: "none", background: "var(--a-sunken)" }} />
                    )}
                    <span className="grow">
                      <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                        {a.title || "Untitled"}
                      </span>
                      <span className="meta">
                        {filter === "all" && <Pill tone={st.tone}>{st.label}</Pill>}
                        <span className="trunc">{[CATEGORY[a.category] || a.category, author(a)].filter(Boolean).join(" · ")}</span>
                      </span>
                    </span>
                    <span className="t12 muted" style={{ flex: "none" }}>
                      {ago(a.updatedAt || a.createdAt)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="ld-pane">
            {!current ? (
              <div className="pane-empty">{all.length ? "Pick a story to see it here." : ""}</div>
            ) : (
              <>
                <div className="pane-head capped">
                  <BackButton onClick={() => select(null)} label="Back to stories" />
                  <Pill tone={statusOf(current).tone} dot>
                    {statusOf(current).label}
                  </Pill>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button type="button" className="btn sm ghost" onClick={() => openHistory(current)} aria-label="History">
                      <History className="ic-sm" />
                      <span className="hide-m">History</span>
                    </button>
                    {
                      <button type="button" className="btn sm" onClick={() => handleToggleArchive(current)} aria-label={current.status === "archived" ? "Unarchive" : "Archive"}>
                        {current.status === "archived" ? <ArchiveRestore className="ic-sm" /> : <Archive className="ic-sm" />}
                        <span className="hide-m">{current.status === "archived" ? "Unarchive" : "Archive"}</span>
                      </button>
                    }
                    {current.status === "published" && (
                      <a href={`/articles/${current.slug}`} target="_blank" rel="noopener noreferrer" className="btn sm" aria-label="View on site">
                        <ExternalLink className="ic-sm" />
                        <span className="hide-m">View on site</span>
                      </a>
                    )}
                    <button type="button" className="btn sm strong" onClick={() => handleStartEdit(current)}>
                      <Pencil className="ic-sm" /> Edit
                    </button>
                  </span>
                </div>
                <div className="pane-body capped" style={{ display: "grid", gap: 16, alignContent: "start" }}>
                  {current.coverImageUrl && (
                    <img src={current.coverImageUrl} alt="" style={{ width: "100%", maxWidth: 640, aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 8, border: "1px solid var(--a-border)" }} />
                  )}
                  <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.25, fontWeight: 700, overflowWrap: "anywhere" }}>{current.title}</h2>
                  {current.summary && <p style={{ margin: 0, lineHeight: 1.6, color: "var(--a-muted)", maxWidth: 640 }}>{current.summary}</p>}
                  <Facts
                    rows={[
                      ["Category", CATEGORY[current.category] || current.category],
                      ["Written by", author(current) || "Unknown"],
                      ["Last change", formatWhen(current.updatedAt || current.createdAt, { year: true })],
                      ["Created", formatDay(current.createdAt)],
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </Body>
      {historySheet}
    </Screen>
  );
}

export default function AdminArticlesConsole() {
  return (
    <AdminAuthGuard requiredPermission={canPublishArticles} featureTitle="Articles">
      <Suspense fallback={null}>
        <AdminArticlesContent />
      </Suspense>
    </AdminAuthGuard>
  );
}
