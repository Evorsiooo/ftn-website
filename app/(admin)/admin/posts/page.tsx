"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Clock, MessageSquarePlus, Loader2, Pencil, PenSquare, Trash2, X } from "lucide-react";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { toast, confirmDialog, promptDialog } from "@/components/gs/dialogs";
import { Button } from "@/components/ui/button";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader } from "@/components/gs/admin-header";
import { canManagePosts, isPostsLeadership } from "@/lib/rbac";
import { RO_STATES } from "@/lib/ro-states";

const fieldClass =
  "w-full rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 py-1.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

const STATUS_STYLES: Record<string, string> = {
  pending: "text-amber-600 dark:text-amber-400",
  approved: "text-emerald-600 dark:text-emerald-400",
  denied: "text-red-600 dark:text-red-400",
};
const DOT: Record<string, string> = { draft: "bg-neutral-400", pending: "bg-amber-500", approved: "bg-emerald-500", denied: "bg-red-500" };

function parseNotes(raw: string | null): string[] {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => new Date(v).getTime();
const formatWhen = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const formatDate = (v: any) => (v ? new Date(v).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

type Filter = "all" | "pending" | "approved" | "denied" | "scheduled" | "drafts";

export default function AdminPostsPage() {
  const [me, setMe] = useState<{ id: string; roles: string[] } | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Filter>("all");
  const [timeEdits, setTimeEdits] = useState<Record<string, string>>({});
  const filterTouched = useRef(false);
  const detailRef = useRef<HTMLElement>(null);

  const isLeadership = me ? isPostsLeadership(me.roles) : false;

  const loadAll = useCallback(async () => {
    try {
      const [postsRes, sessionRes] = await Promise.all([fetch("/api/admin/posts"), fetch("/api/auth/session")]);
      if (postsRes.ok) {
        const list = ((await postsRes.json()) as any).posts || [];
        setPosts(list);
        if (!filterTouched.current && list.some((p: any) => p.status === "pending" && !p.scheduledAt)) setStatusFilter("pending");
      }
      if (sessionRes.ok) {
        const data = (await sessionRes.json()) as any;
        if (data.user) setMe({ id: data.user.id, roles: data.user.roles || [] });
      }
    } catch (err) {
      console.error("Failed to load posts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleDelete = async (post: any, skipConfirm = false) => {
    if (!skipConfirm && !(await confirmDialog("Delete this post?"))) return;
    const res = await fetch(`/api/admin/posts/${post.id}`, { method: "DELETE" });
    if (res.ok) {
      if (selectedId === post.id) setSelectedId(null);
      await loadAll();
    } else {
      toast(((await res.json()) as any).error || "Failed to delete post");
    }
  };

  const handleAmend = async (post: any) => {
    const note = await promptDialog("Edit note to show under the post in Discord (shown as \"edit: ...\"):");
    if (!note || !note.trim()) return;
    const res = await fetch(`/api/admin/posts/${post.id}/amend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) toast(data.error || "Failed to add the edit note");
    else if (data.discordWarning) toast(`The note was saved, but updating Discord failed:\n${data.discordWarning}`);
    await loadAll();
  };

  const handleCancelSchedule = async (post: any) => {
    if (!(await confirmDialog("Cancel this scheduled post? It will be deleted and never sent."))) return;
    await handleDelete(post, true);
  };

  const handlePublishNow = async (post: any) => {
    const res = await fetch(`/api/admin/posts/${post.id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ now: true }),
    });
    if (!res.ok) toast(((await res.json().catch(() => ({}))) as any).error || "Failed to send the post");
    await loadAll();
  };

  const handleSaveTime = async (post: any) => {
    const value = timeEdits[post.id];
    if (!value) return;
    const at = fromLocalInput(value);
    if (!(at > Date.now() + 60_000)) return toast("Choose a publish time in the future.");
    const res = await fetch(`/api/admin/posts/${post.id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledAt: at }),
    });
    if (!res.ok) return toast(((await res.json().catch(() => ({}))) as any).error || "Failed to change the time");
    setTimeEdits((m) => {
      const { [post.id]: _, ...rest } = m;
      return rest;
    });
    await loadAll();
  };

  const handleResend = async (post: any) => {
    const res = await fetch(`/api/admin/posts/${post.id}/resend`, { method: "POST" });
    if (!res.ok) toast(((await res.json()) as any).error || "Failed to resend post");
    await loadAll();
  };

  const handleDecision = async (post: any, decision: "approve" | "deny") => {
    let reason = "";
    if (decision === "deny") {
      reason = ((await promptDialog("Reason for denying this post:")) || "").trim();
      if (!reason) return;
    }
    const res = await fetch(`/api/admin/posts/${post.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) toast(data.error || "Failed to save decision");
    else if (data.warning) toast(`Saved, but updating the Discord message failed:\n${data.warning}`);
    await loadAll();
  };

  const drafts = posts.filter((p) => p.status === "draft");
  const scheduledPosts = posts
    .filter((p) => p.scheduledAt && p.status !== "draft")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const sentPosts = posts.filter((p) => !p.scheduledAt && p.status !== "draft");
  const visiblePosts =
    statusFilter === "scheduled" ? scheduledPosts
    : statusFilter === "drafts" ? drafts
    : statusFilter === "all" ? [...scheduledPosts, ...sentPosts]
    : sentPosts.filter((p) => p.status === statusFilter);
  const filterCount = (f: string) =>
    f === "all" ? scheduledPosts.length + sentPosts.length
    : f === "scheduled" ? scheduledPosts.length
    : f === "drafts" ? drafts.length
    : sentPosts.filter((p) => p.status === f).length;

  const current = posts.find((p) => p.id === selectedId) || null;
  const mine = (p: any) => me?.id === p.createdBy || isLeadership;
  const canDecide = !!current && current.status === "pending" && isLeadership;

  const select = (p: any) => {
    setSelectedId(p.id);
    // Below the wide layout the detail sits under the list.
    if (typeof window !== "undefined" && window.innerWidth < 1280) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <AdminAuthGuard requiredPermission={canManagePosts} featureTitle="Posts">
      <div className="w-full space-y-6 text-neutral-900 dark:text-white">
        <AdminPageHeader
          title="Posts"
          description="Every post with its status, approval details and Discord actions."
          actions={
            <Link href="/admin/posts/creator" className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-brand-ink shadow-sm transition hover:bg-brand-hover">
              <PenSquare className="h-4 w-4" /> Enter the Creator
            </Link>
          }
        />

        <div className="flex flex-wrap gap-1.5">
          {(["pending", "approved", "denied", "scheduled", "drafts", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => { filterTouched.current = true; setStatusFilter(f); }}
              className={`cursor-pointer whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${statusFilter === f ? "border-brand bg-brand text-brand-ink" : "border-neutral-300 text-neutral-600 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-400"}`}
            >
              {f[0].toUpperCase() + f.slice(1)} {filterCount(f)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]">
          <section className="min-w-0">
            {loading ? (
              <div className="flex items-center p-6 text-neutral-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...</div>
            ) : visiblePosts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">Nothing here.</div>
            ) : (
              <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
                {visiblePosts.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => select(p)}
                      className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${selectedId === p.id ? "!bg-brand/15" : ""}`}
                    >
                      <img src={p.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-md bg-neutral-200 object-cover dark:bg-neutral-800" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{p.headline}</span>
                        <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[p.status] || ""}`} />
                          <span className={`font-semibold capitalize ${STATUS_STYLES[p.status] || ""}`}>{p.status}</span>
                          <span className="truncate">· {RO_STATES.find((st) => st.key === p.roState)?.label} · {p.creatorName || "unknown"}</span>
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-right text-xs text-neutral-500 sm:block">
                        {p.scheduledAt ? (
                          <span className="flex items-center gap-1 font-semibold text-sky-600 dark:text-sky-400"><Clock className="h-3 w-3" />{formatWhen(new Date(p.scheduledAt).getTime())}</span>
                        ) : (
                          formatDate(p.createdAt)
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section ref={detailRef} className="min-w-0 scroll-mt-20 xl:sticky xl:top-20">
            {!current ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
                Select a post to see its preview and approval details.
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                {current.mediaType === "video" && current.videoUrl && !current.videoUrl.endsWith(".webp") ? (
                  <video src={current.videoUrl} poster={current.imageUrl} controls playsInline className="mx-auto max-h-[42vh] w-full rounded-lg bg-neutral-900 object-contain" />
                ) : (
                  <img src={current.mediaType === "video" && current.videoUrl ? current.videoUrl : current.imageUrl} alt={current.headline} className="mx-auto max-h-[42vh] w-full rounded-lg bg-neutral-200 object-contain dark:bg-neutral-800" />
                )}
                {parseNotes(current.amendments).map((n, i) => <p key={i} className="text-xs italic text-neutral-500">edit: {n}</p>)}

                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${DOT[current.status] || ""}`} />
                    <span className="text-sm font-bold capitalize">{current.status}</span>
                  </div>
                  <h2 className="mt-1 text-base font-extrabold leading-snug">{current.headline}</h2>
                </div>

                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                  <dt className="text-neutral-500">Ro-State</dt><dd className="font-semibold">{RO_STATES.find((st) => st.key === current.roState)?.label}</dd>
                  <dt className="text-neutral-500">Ad</dt><dd className="font-semibold">{current.noAd ? "No ad" : current.organizationName || "Placeholder"}</dd>
                  <dt className="text-neutral-500">Created by</dt><dd className="font-semibold">{current.creatorName || "unknown"} · {formatDate(current.createdAt)}</dd>
                  {current.decidedByLabel && (
                    <>
                      <dt className="text-neutral-500">{current.status === "denied" ? "Denied by" : "Approved by"}</dt>
                      <dd className="font-semibold">{current.decidedByLabel}{current.decidedAt ? ` · ${formatDate(current.decidedAt)}` : ""}</dd>
                    </>
                  )}
                  {current.status === "denied" && current.denyReason && (
                    <>
                      <dt className="text-neutral-500">Reason</dt><dd className="font-semibold">{current.denyReason}</dd>
                    </>
                  )}
                </dl>

                {current.scheduledAt && (() => {
                  const whenMs = new Date(current.scheduledAt).getTime();
                  const edit = timeEdits[current.id];
                  return (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 p-2 dark:bg-sky-950/30">
                      <span className="flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-400"><Clock className="h-3.5 w-3.5" /> {mine(current) ? "Sends" : `Sends ${formatWhen(whenMs)}`}</span>
                      {mine(current) && (
                        <>
                          <div className="w-48"><DateTimeInput type="datetime-local" value={edit ?? toLocalInput(new Date(whenMs))} min={toLocalInput(new Date())} onChange={(e) => setTimeEdits((m) => ({ ...m, [current.id]: e.target.value }))} className={fieldClass} /></div>
                          {edit && edit !== toLocalInput(new Date(whenMs)) && <Button size="sm" onClick={() => handleSaveTime(current)} className="cursor-pointer">Save time</Button>}
                          <Button size="sm" variant="outline" onClick={() => handlePublishNow(current)} className="cursor-pointer">Publish now</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleCancelSchedule(current)} className="cursor-pointer text-red-600"><X className="h-3.5 w-3.5" /> Cancel</Button>
                        </>
                      )}
                    </div>
                  );
                })()}

                <div className="flex flex-wrap gap-2">
                  {mine(current) && (current.status === "pending" || current.status === "draft") && (
                    <Link href={`/admin/posts/creator?edit=${encodeURIComponent(current.id)}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-300 px-3 text-xs font-semibold transition hover:border-neutral-500 dark:border-neutral-700">
                      <Pencil className="h-3.5 w-3.5" /> {current.status === "draft" ? "Edit draft" : "Edit in the Creator"}
                    </Link>
                  )}
                  {!current.scheduledAt && current.status === "pending" && mine(current) && (!current.ftnPlusMessageId || !current.leadershipMessageId) && (
                    <Button size="sm" variant="outline" onClick={() => handleResend(current)} className="cursor-pointer">Resend to Discord</Button>
                  )}
                  {canDecide && (
                    <>
                      <Button size="sm" onClick={() => handleDecision(current, "approve")} className="cursor-pointer"><Check className="h-3.5 w-3.5" /> Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDecision(current, "deny")} className="cursor-pointer"><X className="h-3.5 w-3.5" /> Deny</Button>
                    </>
                  )}
                  {current.status !== "denied" && current.status !== "draft" && mine(current) && (
                    <Button size="sm" variant="outline" onClick={() => handleAmend(current)} className="cursor-pointer"><MessageSquarePlus className="h-3.5 w-3.5" /> Edit note</Button>
                  )}
                  {mine(current) && (
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(current)} className="cursor-pointer text-red-600"><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminAuthGuard>
  );
}
