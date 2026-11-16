"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ExternalLink, Pencil, Plus, RotateCw, Search, Send, Trash2, X } from "lucide-react";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { toast, confirmDialog, promptDialog } from "@/components/gs/dialogs";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { BackButton, Body, DT_CLASS, Facts, PageBar, Pill, Screen, Seg, ago, formatWhen, type Tone } from "@/components/admin/ui";
import { canManagePosts, isPostsLeadership } from "@/lib/rbac";
import { RO_STATES } from "@/lib/ro-states";
import { FEED_CHANNELS, FTN_PLUS_CHANNEL_ID, LEADERSHIP_CHANNEL_ID } from "@/lib/discord";
import { refreshAdminSummary } from "@/lib/admin-summary";
import { cn } from "@/lib/utils";

const GUILD_ID = "1152594197711437936";
const discordLink = (channel: string | null | undefined, message: string | null | undefined) =>
  channel && message ? `https://discord.com/channels/${GUILD_ID}/${channel}/${message}` : null;

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
const stateLabel = (key: string) => RO_STATES.find((st) => st.key === key)?.label ?? key;

type Filter = "pending" | "scheduled" | "drafts" | "approved" | "denied" | "all";

function statusOf(p: any): { label: string; tone: Tone } {
  if (p.status === "draft") return { label: "Draft", tone: "grey" };
  if (p.scheduledAt) return { label: "Scheduled", tone: "blue" };
  if (p.status === "pending") return { label: "Waiting", tone: "amber" };
  if (p.status === "approved") return { label: "Published", tone: "green" };
  return { label: "Denied", tone: "red" };
}

/** Day heading for the list: "Today", "Yesterday", "Wed 12 Nov". */
function dayKey(v: any): string {
  const d = new Date(v);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(new Date())) / 86400000);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function PostsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [me, setMe] = useState<{ id: string; roles: string[] } | null>(null);
  const [posts, setPosts] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [timeEdit, setTimeEdit] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const filterTouched = useRef(false);
  const selectedId = params.get("id");

  const isLeadership = me ? isPostsLeadership(me.roles) : false;

  const loadAll = useCallback(async () => {
    try {
      const [postsRes, sessionRes] = await Promise.all([fetch("/api/admin/posts"), fetch("/api/auth/session")]);
      if (postsRes.ok) {
        const list = ((await postsRes.json()) as any).posts || [];
        setPosts(list);
        if (!filterTouched.current && list.some((p: any) => p.status === "pending" && !p.scheduledAt)) setFilter("pending");
        filterTouched.current = true;
      } else setPosts([]);
      if (sessionRes.ok) {
        const data = (await sessionRes.json()) as any;
        if (data.user) setMe({ id: data.user.id, roles: data.user.roles || [] });
      }
    } catch (err) {
      console.error("Failed to load posts:", err);
      setPosts([]);
    }
    refreshAdminSummary();
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const select = (id: string | null) => {
    setTimeEdit(null);
    setNote("");
    router.replace(id ? `/admin/posts?id=${encodeURIComponent(id)}` : "/admin/posts", { scroll: false });
  };

  const all = posts ?? [];
  const drafts = all.filter((p) => p.status === "draft");
  const scheduled = all.filter((p) => p.scheduledAt && p.status !== "draft").sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const sent = all.filter((p) => !p.scheduledAt && p.status !== "draft");
  const byFilter: Record<Filter, any[]> = {
    pending: sent.filter((p) => p.status === "pending"),
    scheduled,
    drafts,
    approved: sent.filter((p) => p.status === "approved"),
    denied: sent.filter((p) => p.status === "denied"),
    all: [...scheduled, ...sent],
  };
  const needle = query.trim().toLowerCase();
  const visible = byFilter[filter].filter((p) => !needle || `${p.headline} ${p.creatorName ?? ""} ${p.organizationName ?? ""} ${stateLabel(p.roState)}`.toLowerCase().includes(needle));

  // Group the list by day (scheduled posts by the day they go out).
  const groups = useMemo(() => {
    const out: { key: string; items: any[] }[] = [];
    for (const p of visible) {
      const key = p.scheduledAt && p.status !== "draft" ? `Scheduled · ${dayKey(p.scheduledAt)}` : dayKey(p.status === "draft" ? p.updatedAt || p.createdAt : p.createdAt);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(p);
      else out.push({ key, items: [p] });
    }
    return out;
  }, [visible]);

  const current = all.find((p) => p.id === selectedId) || null;
  const mine = (p: any) => me?.id === p.createdBy || isLeadership;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (post: any, skipConfirm = false) => {
    if (!skipConfirm && !(await confirmDialog(`Delete "${post.headline}"? It is also removed from Discord.`, { ok: "Delete", danger: true }))) return;
    await run("delete", async () => {
      const res = await fetch(`/api/admin/posts/${post.id}`, { method: "DELETE" });
      if (res.ok) {
        select(null);
        await loadAll();
      } else toast(((await res.json()) as any).error || "Failed to delete post");
    });
  };

  const handleAmend = async (post: any) => {
    const text = note.trim();
    if (!text) return;
    await run("amend", async () => {
      const res = await fetch(`/api/admin/posts/${post.id}/amend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: text }) });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) toast(data.error || "Failed to add the edit note");
      else {
        setNote("");
        if (data.discordWarning) toast(`The note was saved, but updating Discord failed:\n${data.discordWarning}`);
      }
      await loadAll();
    });
  };

  const handleCancelSchedule = async (post: any) => {
    if (!(await confirmDialog("Cancel this scheduled post? It will be deleted and never sent.", { ok: "Cancel post", danger: true }))) return;
    await handleDelete(post, true);
  };

  const handlePublishNow = async (post: any) =>
    run("now", async () => {
      const res = await fetch(`/api/admin/posts/${post.id}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ now: true }) });
      if (!res.ok) toast(((await res.json().catch(() => ({}))) as any).error || "Failed to send the post");
      await loadAll();
    });

  const handleSaveTime = async (post: any) => {
    if (!timeEdit) return;
    const at = fromLocalInput(timeEdit);
    if (!(at > Date.now() + 60_000)) return toast("Choose a publish time in the future.");
    await run("time", async () => {
      const res = await fetch(`/api/admin/posts/${post.id}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledAt: at }) });
      if (!res.ok) return toast(((await res.json().catch(() => ({}))) as any).error || "Failed to change the time");
      setTimeEdit(null);
      await loadAll();
    });
  };

  const handleResend = async (post: any) =>
    run("resend", async () => {
      const res = await fetch(`/api/admin/posts/${post.id}/resend`, { method: "POST" });
      if (!res.ok) toast(((await res.json()) as any).error || "Failed to resend post");
      else toast("Sent to Discord again.");
      await loadAll();
    });

  const handleDecision = async (post: any, decision: "approve" | "deny") => {
    let reason = "";
    if (decision === "deny") {
      reason = ((await promptDialog("Why is this post denied? The author sees this.", "", { ok: "Deny", danger: true })) || "").trim();
      if (!reason) return;
    }
    await run(decision, async () => {
      const res = await fetch(`/api/admin/posts/${post.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason }) });
      const data = (await res.json()) as any;
      if (!res.ok) toast(data.error || "Failed to save decision");
      else if (data.warning) toast(`Saved, but updating the Discord message failed:\n${data.warning}`);
      await loadAll();
    });
  };

  const filters: { value: Filter; label: string; n: number }[] = [
    { value: "pending", label: "Waiting", n: byFilter.pending.length },
    { value: "scheduled", label: "Scheduled", n: byFilter.scheduled.length },
    { value: "drafts", label: "Drafts", n: byFilter.drafts.length },
    { value: "approved", label: "Published", n: byFilter.approved.length },
    { value: "denied", label: "Denied", n: byFilter.denied.length },
    { value: "all", label: "All", n: byFilter.all.length },
  ];
  const pick = (f: Filter) => {
    filterTouched.current = true;
    setFilter(f);
  };

  return (
    <Screen>
      <PageBar
        title="Posts"
        tools={
          <>
            <Seg value={filter} onChange={pick} options={filters} label="Show" />
            <div className="search" style={{ width: 220 }}>
              <Search />
              <input className="input sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search posts" aria-label="Search posts" />
            </div>
          </>
        }
        end={
          <Link href="/admin/posts/creator" className="btn primary has-lbl-m" aria-label="New post">
            <Plus className="ic" />
            <span className="lbl-m">New post</span>
          </Link>
        }
        mrow={
          <select className="select sm" style={{ flex: 1 }} value={filter} onChange={(e) => pick(e.target.value as Filter)} aria-label="Show">
            {filters.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label} ({f.n})
              </option>
            ))}
          </select>
        }
      />
      <Body>
        <div className={cn("ld", current && "detail")}>
          <div className="ld-list">
            {posts === null ? (
              <div className="empty">Loading posts…</div>
            ) : visible.length === 0 ? (
              <div className="empty">{needle ? "No post matches your search." : filter === "pending" ? "Nothing waiting for approval." : "No posts here yet."}</div>
            ) : (
              groups.map((g) => (
                <div key={g.key}>
                  <div className="group">
                    <span>{g.key}</span>
                    <span>{g.items.length}</span>
                  </div>
                  {g.items.map((p) => {
                    const st = statusOf(p);
                    const when = p.scheduledAt && p.status !== "draft" ? p.scheduledAt : p.createdAt;
                    return (
                      <button key={p.id} type="button" className={cn("item", p.id === selectedId && "on")} onClick={() => select(p.id)}>
                        <img src={p.imageUrl} alt="" className="thumb" width={44} height={44} style={{ width: 44, height: 44 }} />
                        <span className="grow">
                          <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                            {p.headline || "Untitled"}
                          </span>
                          <span className="meta">
                            <Pill tone={st.tone}>{st.label}</Pill>
                            <span className="trunc">
                              {stateLabel(p.roState)} · {p.creatorName || "unknown"}
                            </span>
                          </span>
                        </span>
                        <span className="t12 muted num" style={{ flex: "none" }}>
                          {new Date(when).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="ld-pane">
            {!current ? (
              <div className="pane-empty">{posts && posts.length > 0 ? "Pick a post to see it here." : ""}</div>
            ) : (
              <PostDetail
                post={current}
                mine={mine(current)}
                canDecide={current.status === "pending" && !current.scheduledAt && isLeadership}
                busy={busy}
                note={note}
                setNote={setNote}
                timeEdit={timeEdit}
                setTimeEdit={setTimeEdit}
                onBack={() => select(null)}
                onDecision={(d) => handleDecision(current, d)}
                onDelete={() => handleDelete(current)}
                onAmend={() => handleAmend(current)}
                onResend={() => handleResend(current)}
                onPublishNow={() => handlePublishNow(current)}
                onSaveTime={() => handleSaveTime(current)}
                onCancelSchedule={() => handleCancelSchedule(current)}
              />
            )}
          </div>
        </div>
      </Body>
    </Screen>
  );
}

function PostDetail({
  post,
  mine,
  canDecide,
  busy,
  note,
  setNote,
  timeEdit,
  setTimeEdit,
  onBack,
  onDecision,
  onDelete,
  onAmend,
  onResend,
  onPublishNow,
  onSaveTime,
  onCancelSchedule,
}: {
  post: any;
  mine: boolean;
  canDecide: boolean;
  busy: string | null;
  note: string;
  setNote: (v: string) => void;
  timeEdit: string | null;
  setTimeEdit: (v: string | null) => void;
  onBack: () => void;
  onDecision: (d: "approve" | "deny") => void;
  onDelete: () => void;
  onAmend: () => void;
  onResend: () => void;
  onPublishNow: () => void;
  onSaveTime: () => void;
  onCancelSchedule: () => void;
}) {
  const st = statusOf(post);
  const notes = parseNotes(post.amendments);
  const canEdit = mine && (post.status === "pending" || post.status === "draft");
  const canResend = !post.scheduledAt && post.status === "pending" && mine && (!post.ftnPlusMessageId || !post.leadershipMessageId);
  const canNote = post.status !== "denied" && post.status !== "draft" && mine;
  const whenMs = post.scheduledAt ? new Date(post.scheduledAt).getTime() : 0;
  const links = [
    { label: "#ftn-plus", href: discordLink(FTN_PLUS_CHANNEL_ID, post.ftnPlusMessageId) },
    { label: "#leadership", href: discordLink(LEADERSHIP_CHANNEL_ID, post.leadershipMessageId) },
    { label: `${stateLabel(post.roState)} feed`, href: discordLink(post.feedChannelId || FEED_CHANNELS[post.roState], post.feedMessageId) },
  ].filter((l) => l.href);

  const rows: [React.ReactNode, React.ReactNode][] = [
    ["Ro-State", stateLabel(post.roState)],
    ["Ad", post.noAd ? "No ad" : post.organizationName || "Placeholder"],
    ["Made by", `${post.creatorName || "unknown"} · ${formatWhen(post.createdAt)}`],
  ];
  if (post.scheduledAt) rows.push(["Goes out", formatWhen(whenMs)]);
  if (post.decidedByLabel) rows.push([post.status === "denied" ? "Denied by" : "Approved by", `${post.decidedByLabel}${post.decidedAt ? ` · ${formatWhen(post.decidedAt)}` : ""}`]);
  if (post.status === "denied" && post.denyReason) rows.push(["Reason", post.denyReason]);
  if (links.length)
    rows.push([
      "Discord",
      <span key="l" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {links.map((l) => (
          <a key={l.label} href={l.href!} target="_blank" rel="noreferrer" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {l.label}
            <ExternalLink className="ic-sm" />
          </a>
        ))}
      </span>,
    ]);

  return (
    <>
      <div className="pane-head capped">
        <BackButton onClick={onBack} label="Back to posts" />
        <Pill tone={st.tone}>{st.label}</Pill>
        <span className="t12 muted hide-m">{post.status === "pending" && !post.scheduledAt ? `Sent ${ago(post.createdAt)}` : ""}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEdit && (
            <Link href={`/admin/posts/creator?edit=${encodeURIComponent(post.id)}`} className="btn sm">
              <Pencil className="ic-sm" /> Edit
            </Link>
          )}
          {canResend && (
            <button type="button" className="btn sm" disabled={!!busy} onClick={onResend}>
              <RotateCw className="ic-sm" /> Resend to Discord
            </button>
          )}
          {mine && (
            <button type="button" className="btn sm ghost danger" disabled={!!busy} onClick={onDelete} aria-label="Delete post">
              <Trash2 className="ic-sm" />
              <span className="hide-m">Delete</span>
            </button>
          )}
          {canDecide && (
            <>
              <button type="button" className="btn sm" disabled={!!busy} onClick={() => onDecision("deny")}>
                <X className="ic-sm" /> Deny
              </button>
              <button type="button" className="btn sm strong" disabled={!!busy} onClick={() => onDecision("approve")}>
                <Check className="ic-sm" /> {busy === "approve" ? "Approving…" : "Approve"}
              </button>
            </>
          )}
        </span>
      </div>
      <div className="pane-body capped">
        <div className="post-detail">
          <div>
            {post.mediaType === "video" && post.videoUrl && !post.videoUrl.endsWith(".webp") ? (
              <video src={post.videoUrl} poster={post.imageUrl} controls playsInline style={{ width: "100%", borderRadius: 8, background: "#000", display: "block" }} />
            ) : (
              <img
                src={post.mediaType === "video" && post.videoUrl ? post.videoUrl : post.imageUrl}
                alt={post.headline}
                style={{ width: "100%", aspectRatio: "1", objectFit: "contain", borderRadius: 8, background: "var(--a-sunken)", display: "block" }}
              />
            )}
          </div>
          <div style={{ display: "grid", gap: 16 }}>
            <div>
              <h2 className="t16" style={{ margin: 0, fontWeight: 600, lineHeight: 1.35 }}>
                {post.headline}
              </h2>
              {post.body && (
                <p className="muted" style={{ margin: "6px 0 0", whiteSpace: "pre-line" }}>
                  {post.body}
                </p>
              )}
            </div>
            <Facts rows={rows} />

            {post.scheduledAt && mine && (
              <div className="card" style={{ padding: 12, display: "grid", gap: 8 }}>
                <div className="lbl">Publish time</div>
                <DateTimeInput
                  type="datetime-local"
                  value={timeEdit ?? toLocalInput(new Date(whenMs))}
                  min={toLocalInput(new Date())}
                  onChange={(e) => setTimeEdit(e.target.value)}
                  className={DT_CLASS}
                  aria-label="Publish time"
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {timeEdit && timeEdit !== toLocalInput(new Date(whenMs)) && (
                    <button type="button" className="btn sm strong" disabled={!!busy} onClick={onSaveTime}>
                      Save time
                    </button>
                  )}
                  <button type="button" className="btn sm" disabled={!!busy} onClick={onPublishNow}>
                    <Send className="ic-sm" /> Send now
                  </button>
                  <button type="button" className="btn sm ghost danger" disabled={!!busy} onClick={onCancelSchedule}>
                    Cancel post
                  </button>
                </div>
              </div>
            )}

            {(notes.length > 0 || canNote) && (
              <div style={{ display: "grid", gap: 8 }}>
                <div className="lbl">Edit notes</div>
                {notes.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                    {notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="help">Shown under the post in Discord as &quot;edit: …&quot;.</div>
                )}
                {canNote && (
                  <form
                    style={{ display: "flex", gap: 8 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      onAmend();
                    }}
                  >
                    <input className="input sm" style={{ flex: 1 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an edit note" aria-label="Edit note" />
                    <button type="submit" className="btn sm" disabled={!note.trim() || !!busy}>
                      Add
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function AdminPostsPage() {
  return (
    <AdminAuthGuard requiredPermission={canManagePosts} featureTitle="Posts">
      <React.Suspense fallback={null}>
        <PostsPage />
      </React.Suspense>
    </AdminAuthGuard>
  );
}
