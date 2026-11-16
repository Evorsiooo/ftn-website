"use client";
import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, CheckCheck, MoreHorizontal, PenLine, Search } from "lucide-react";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { BackButton, Body, Facts, PageBar, Pill, Screen, Seg, ago, formatWhen, type Tone } from "@/components/admin/ui";
import { refreshAdminSummary } from "@/lib/admin-summary";
import { canPublishArticles, canConfigureSite } from "@/lib/rbac";
import { cn } from "@/lib/utils";

interface TipItem {
  id: string;
  subject: string;
  details: string;
  contactChannel?: string | null;
  status: "unread" | "investigating" | "dismissed" | "published";
  createdAt: string;
}
type Filter = "unread" | "investigating" | "dismissed" | "all";

const STATUS: Record<TipItem["status"], { label: string; tone: Tone; dot: string }> = {
  unread: { label: "Unread", tone: "amber", dot: "amber" },
  investigating: { label: "Investigating", tone: "blue", dot: "blue" },
  dismissed: { label: "Dismissed", tone: "grey", dot: "grey" },
  published: { label: "Published", tone: "green", dot: "green" },
};

function TipsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("id");
  const select = (id: string | null) => router.replace(id ? `/admin/tips?id=${encodeURIComponent(id)}` : "/admin/tips", { scroll: false });

  const [tipsList, setTipsList] = useState<TipItem[] | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("unread");
  const [query, setQuery] = useState("");

  const fetchTips = () => {
    fetch("/api/admin/tips")
      .then((res) => res.json())
      .then((data: any) => setTipsList(data && Array.isArray(data.tips) ? data.tips : []))
      .catch((err) => {
        console.error("Error fetching tips:", err);
        setTipsList([]);
      });
  };

  useEffect(() => {
    fetchTips();
  }, []);

  // A tip opened from a link (?id=) shows on its own filter.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (opened || !tipsList) return;
    const t = selectedId ? tipsList.find((x) => x.id === selectedId) : null;
    if (t && t.status !== "unread") setFilter(t.status === "published" ? "all" : t.status);
    setOpened(true);
  }, [tipsList, selectedId, opened]);

  const updateStatus = async (id: string, newStatus: TipItem["status"]) => {
    try {
      setActionLoading(id);
      const res = await fetch("/api/admin/tips", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (res.ok) {
        setTipsList((prev) => (prev || []).map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
        refreshAdminSummary();
      } else toast(((await res.json().catch(() => ({}))) as any).error || "Failed to update the tip.");
    } catch (err) {
      console.error("Failed to update tip status:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const all = tipsList || [];
  const unreadCount = all.filter((t) => t.status === "unread").length;

  const handleDismissAll = async () => {
    if (unreadCount === 0) return toast("No unread tips to dismiss.");
    if (!(await confirmDialog(`Dismiss all ${unreadCount} unread ${unreadCount === 1 ? "tip" : "tips"}?`, { ok: "Dismiss all" }))) return;
    try {
      setActionLoading("dismiss_all");
      const res = await fetch("/api/admin/tips", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss_all" }),
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        setTipsList((prev) => (prev || []).map((t) => (t.status === "unread" ? { ...t, status: "dismissed" } : t)));
        refreshAdminSummary();
      } else toast(data.error || "Failed to dismiss tips.");
    } catch {
      toast("Network error while dismissing tips.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBlacklist = async (tip: TipItem) => {
    if (
      !(await confirmDialog("Blacklist this submitter?\n\nThey get a permanent site-wide mute, so they can't comment or send tips again, and this tip is dismissed.", {
        ok: "Blacklist",
        danger: true,
      }))
    )
      return;
    try {
      setActionLoading(tip.id);
      const res = await fetch("/api/admin/tips", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tip.id, action: "blacklist" }),
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        toast(data.message || "Submitter blacklisted and tip dismissed.");
        setTipsList((prev) => (prev || []).map((t) => (t.id === tip.id ? { ...t, status: "dismissed" } : t)));
        refreshAdminSummary();
      } else toast(data.error || "Failed to blacklist submitter.");
    } catch {
      toast("Network error while blacklisting submitter.");
    } finally {
      setActionLoading(null);
    }
  };

  const needle = query.trim().toLowerCase();
  const visible = (filter === "all" ? all : all.filter((t) => t.status === filter))
    .filter((t) => !needle || `${t.subject} ${t.details} ${t.contactChannel || ""}`.toLowerCase().includes(needle))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const picked = selectedId ? (all.find((t) => t.id === selectedId) ?? null) : null;
  // On a computer the first tip shows straight away; on a phone the list stays until one is tapped.
  const current = picked ?? visible[0] ?? null;

  const startArticle = (tip: TipItem) => {
    try {
      sessionStorage.setItem(
        "ftn_tip_draft",
        JSON.stringify({
          title: tip.subject,
          content: `<p>${tip.details.replace(/&/g, "&amp;").replace(/</g, "&lt;").split("\n").join("</p><p>")}</p>`,
        }),
      );
    } catch {}
    if (tip.status === "unread") updateStatus(tip.id, "investigating");
    router.push("/admin/articles?from=tip");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable))) return;
      if (document.querySelector(".adm-dialog-back, .adm-sheet-back, .adm-jumpbar-back")) return;
      const i = current ? visible.findIndex((t) => t.id === current.id) : -1;
      if (e.key === "j" && visible[i + 1]) select(visible[i + 1].id);
      else if (e.key === "k" && i > 0) select(visible[i - 1].id);
      else if (e.key === "i" && current && current.status === "unread") updateStatus(current.id, "investigating");
      else if (e.key === "d" && current && current.status !== "dismissed") {
        if (visible[i + 1]) select(visible[i + 1].id);
        else if (i > 0) select(visible[i - 1].id);
        updateStatus(current.id, "dismissed");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const count = (f: Filter) => (f === "all" ? all.length : all.filter((t) => t.status === f).length);
  const filters = (["unread", "investigating", "dismissed", "all"] as const).map((f) => ({
    value: f,
    label: f === "all" ? "All" : STATUS[f].label,
    n: count(f),
  }));
  const pick = (f: Filter) => {
    setFilter(f);
    select(null);
  };
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);
  const dismissAll = (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn icon"
        aria-label="More"
        aria-expanded={menu}
        onClick={(e) => {
          e.stopPropagation();
          setMenu((v) => !v);
        }}
      >
        <MoreHorizontal className="ic" />
      </button>
      {menu && (
        <div
          className="card"
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: 40,
            zIndex: 20,
            padding: 4,
            minWidth: 220,
            boxShadow: "var(--a-shadow)",
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="btn ghost"
            style={{ width: "100%", justifyContent: "flex-start" }}
            disabled={unreadCount === 0 || actionLoading === "dismiss_all"}
            onClick={handleDismissAll}
          >
            <CheckCheck className="ic" /> Dismiss all unread
            {unreadCount ? ` (${unreadCount})` : ""}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Screen>
      <PageBar
        title="Tipline"
        tools={
          <>
            <Seg value={filter} onChange={pick} options={filters} label="Show" />
            <div className="search" style={{ width: 220 }}>
              <Search />
              <input className="input sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tips" aria-label="Search tips" />
            </div>
            <span className="t12 muted hide-m" style={{ whiteSpace: "nowrap" }}>
              <span className="kbd">j</span> <span className="kbd">k</span> move · <span className="kbd">i</span> investigate · <span className="kbd">d</span> dismiss
            </span>
          </>
        }
        end={dismissAll}
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
        <div className={cn("ld", picked && "detail")}>
          <div className="ld-list">
            {tipsList === null ? (
              <div className="empty">Loading tips…</div>
            ) : visible.length === 0 ? (
              <div className="empty">{needle ? "No tip matches your search." : filter === "unread" ? "No unread tips. You're all caught up." : "Nothing here."}</div>
            ) : (
              visible.map((t) => (
                <button key={t.id} type="button" className={cn("item", current?.id === t.id && "on")} onClick={() => select(t.id)}>
                  <span className={cn("dot", STATUS[t.status].dot)} />
                  <span className="grow">
                    <span
                      className="trunc"
                      style={{
                        display: "block",
                        fontWeight: t.status === "unread" ? 600 : 500,
                      }}
                    >
                      {t.subject}
                    </span>
                    <span className="meta">
                      <span className="trunc">{t.details}</span>
                    </span>
                  </span>
                  <span className="t12 muted num" style={{ flex: "none" }}>
                    {ago(t.createdAt)}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="ld-pane">
            {!current ? (
              <div className="pane-empty">{tipsList && all.length ? "Pick a tip to read it." : ""}</div>
            ) : (
              <>
                <div className="pane-head capped">
                  <BackButton onClick={() => select(null)} label="Back to tips" />
                  <Pill tone={STATUS[current.status].tone} dot>
                    {STATUS[current.status].label}
                  </Pill>
                  <span
                    style={{
                      marginLeft: "auto",
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    {Boolean(current.contactChannel && (current.contactChannel.includes("roblox:@") || current.contactChannel.includes("uid:"))) && (
                      <button type="button" className="btn sm ghost danger" disabled={actionLoading === current.id} onClick={() => handleBlacklist(current)}>
                        <Ban className="ic-sm" />
                        <span className="hide-m">Blacklist submitter</span>
                      </button>
                    )}
                    {current.status !== "dismissed" && (
                      <button type="button" className="btn sm" disabled={actionLoading === current.id} onClick={() => updateStatus(current.id, "dismissed")}>
                        Dismiss
                      </button>
                    )}
                    {current.status === "unread" && (
                      <button type="button" className="btn sm" disabled={actionLoading === current.id} onClick={() => updateStatus(current.id, "investigating")}>
                        Investigate
                      </button>
                    )}
                    <button type="button" className="btn sm strong" onClick={() => startArticle(current)}>
                      <PenLine className="ic-sm" />
                      <span className="hide-m">Start article</span>
                      <span className="show-m">Article</span>
                    </button>
                  </span>
                </div>
                <div className="pane-body capped" style={{ display: "grid", gap: 16, alignContent: "start" }}>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 22,
                      lineHeight: 1.25,
                      fontWeight: 700,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {current.subject}
                  </h2>
                  <Facts
                    rows={[
                      ["Sent", formatWhen(current.createdAt, { year: true })],
                      ["Contact", current.contactChannel || <span className="muted">Anonymous</span>],
                    ]}
                  />
                  <div
                    className="card"
                    style={{
                      padding: 16,
                      whiteSpace: "pre-line",
                      lineHeight: 1.6,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {current.details}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Body>
    </Screen>
  );
}

export default function AdminTipsConsole() {
  return (
    <AdminAuthGuard requiredPermission={(roles) => canPublishArticles(roles) || canConfigureSite(roles)} featureTitle="Tipline">
      <React.Suspense fallback={null}>
        <TipsPage />
      </React.Suspense>
    </AdminAuthGuard>
  );
}
