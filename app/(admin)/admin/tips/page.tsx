"use client";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Clock, ArrowLeft, MessageSquare, UserCheck, ShieldAlert, CheckCheck, Ban } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader, AdminTab } from "@/components/gs/admin-header";
import { canPublishArticles, canConfigureSite } from "@/lib/rbac";

interface TipItem {
  id: string;
  subject: string;
  details: string;
  contactChannel?: string | null;
  status: "unread" | "investigating" | "dismissed" | "published";
  createdAt: string;
}

export default function AdminTipsConsole() {
  const [tipsList, setTipsList] = useState<TipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<"unread" | "investigating" | "dismissed" | "all">("unread");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchTips = () => {
    fetch("/api/admin/tips")
      .then((res) => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.tips)) {
          setTipsList(data.tips);
        }
      })
      .catch((err) => console.error("Error fetching tips:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTips();
  }, []);

  const updateStatus = async (id: string, newStatus: TipItem["status"]) => {
    try {
      setActionLoading(id);
      const res = await fetch("/api/admin/tips", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (res.ok) {
        setTipsList((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t))
        );
      }
    } catch (err) {
      console.error("Failed to update tip status:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDismissAll = async () => {
    const unreadCount = tipsList.filter((t) => t.status === "unread").length;
    if (unreadCount === 0) {
      toast("No unread tips to dismiss.");
      return;
    }

    if (!await confirmDialog(`Are you sure you want to dismiss all ${unreadCount} unread tip(s)?`)) {
      return;
    }

    try {
      setActionLoading("dismiss_all");
      const res = await fetch("/api/admin/tips", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss_all" }),
      });
      const data = (await res.json()) as any;
      if (res.ok) {
        setTipsList((prev) =>
          prev.map((t) => (t.status === "unread" ? { ...t, status: "dismissed" } : t))
        );
      } else {
        toast(data.error || "Failed to dismiss tips.");
      }
    } catch (err) {
      toast("Network error while dismissing tips.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBlacklist = async (tip: TipItem) => {
    if (
      !await confirmDialog(
        `Are you sure you want to BLACKLIST this submitter?\n\nThis will apply a permanent site-wide mute preventing them from commenting and submitting future tips, and dismiss this lead.`
      )
    ) {
      return;
    }

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
        setTipsList((prev) =>
          prev.map((t) => (t.id === tip.id ? { ...t, status: "dismissed" } : t))
        );
      } else {
        toast(data.error || "Failed to blacklist submitter.");
      }
    } catch (err) {
      toast("Network error while blacklisting submitter.");
    } finally {
      setActionLoading(null);
    }
  };

  const visible = filter === "all" ? tipsList : tipsList.filter((t) => t.status === filter);
  const selected = visible.find((t) => t.id === selectedId) ?? visible[0];
  const unreadCount = tipsList.filter((t) => t.status === "unread").length;

  return (
    <AdminAuthGuard requiredPermission={(roles) => canPublishArticles(roles) || canConfigureSite(roles)} featureTitle="Investigative Tipline">
      <div className="mx-auto max-w-6xl space-y-8 text-neutral-900 dark:text-white">
        <AdminPageHeader
          title="Tipline"
          description="Review anonymous investigative leads and reports."
          actions={
            unreadCount > 0 ? (
              <Button size="sm" variant="outline" onClick={handleDismissAll} disabled={actionLoading === "dismiss_all"} className="h-10 cursor-pointer gap-1.5 px-5 text-sm">
                <CheckCheck className="h-4 w-4" /> Dismiss all unread ({unreadCount})
              </Button>
            ) : undefined
          }
        />

        <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-neutral-200 dark:border-neutral-800">
          {(["unread", "investigating", "dismissed", "all"] as const).map((f) => (
            <AdminTab key={f} active={filter === f} onClick={() => { setFilter(f); setSelectedId(null); }}>
              {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)} ({f === "all" ? tipsList.length : tipsList.filter((t) => t.status === f).length})
            </AdminTab>
          ))}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-500">Loading tipline submissions...</div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-sm text-neutral-500 dark:border-neutral-700">
            <MessageSquare className="mx-auto mb-2 h-8 w-8 text-neutral-400" />
            Nothing here.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <ul className="divide-y divide-neutral-200 self-start overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
              {visible.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`block w-full cursor-pointer px-4 py-3 text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-800/60 ${selected?.id === t.id ? "bg-brand/15" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${t.status === "unread" ? "bg-brand" : t.status === "investigating" ? "bg-sky-500" : "bg-neutral-400"}`} />
                      <span className="truncate text-sm font-bold">{t.subject}</span>
                    </div>
                    <div className="mt-0.5 pl-4 text-xs text-neutral-500">{formatDate(t.createdAt)}</div>
                  </button>
                </li>
              ))}
            </ul>

            {selected && (
              <Card className="space-y-5 self-start rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
                <div>
                  <h2 className="text-2xl font-extrabold leading-tight">{selected.subject}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(selected.createdAt)}</span>
                    <span className="capitalize">{selected.status}</span>
                    {selected.contactChannel && (
                      <span className="inline-flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" />{selected.contactChannel}</span>
                    )}
                  </div>
                </div>

                <p className="whitespace-pre-line rounded-xl bg-neutral-100 p-4 text-sm leading-relaxed dark:bg-neutral-800/60">{selected.details}</p>

                <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                  {selected.status === "unread" && (
                    <Button size="sm" disabled={actionLoading === selected.id} className="cursor-pointer text-xs font-bold" onClick={() => updateStatus(selected.id, "investigating")}>
                      Investigate
                    </Button>
                  )}
                  {selected.status !== "dismissed" && (
                    <Button size="sm" variant="outline" disabled={actionLoading === selected.id} className="cursor-pointer text-xs" onClick={() => updateStatus(selected.id, "dismissed")}>
                      Dismiss
                    </Button>
                  )}
                  {Boolean(selected.contactChannel && (selected.contactChannel.includes("roblox:@") || selected.contactChannel.includes("uid:"))) && (
                    <Button size="sm" variant="outline" disabled={actionLoading === selected.id} className="ml-auto cursor-pointer gap-1 text-xs font-semibold text-red-600 dark:text-red-400" onClick={() => handleBlacklist(selected)}>
                      <Ban className="h-3.5 w-3.5" /> Blacklist submitter
                    </Button>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </AdminAuthGuard>
  );
}
