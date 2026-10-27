"use client";
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
      alert("No unread tips to dismiss.");
      return;
    }

    if (!confirm(`Are you sure you want to dismiss all ${unreadCount} unread tip(s)?`)) {
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
        alert(data.error || "Failed to dismiss tips.");
      }
    } catch (err) {
      alert("Network error while dismissing tips.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBlacklist = async (tip: TipItem) => {
    if (
      !confirm(
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
        alert(data.message || "Submitter blacklisted and tip dismissed.");
        setTipsList((prev) =>
          prev.map((t) => (t.id === tip.id ? { ...t, status: "dismissed" } : t))
        );
      } else {
        alert(data.error || "Failed to blacklist submitter.");
      }
    } catch (err) {
      alert("Network error while blacklisting submitter.");
    } finally {
      setActionLoading(null);
    }
  };

  const unreadCount = tipsList.filter((t) => t.status === "unread").length;

  return (
    <AdminAuthGuard requiredPermission={(roles) => canPublishArticles(roles) || canConfigureSite(roles)} featureTitle="Investigative Tipline">
      <div className="mx-auto max-w-4xl space-y-8 text-neutral-900 dark:text-white">
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

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-extrabold text-neutral-900 dark:text-white">Incoming Leads ({tipsList.length})</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-neutral-500 rounded-[1.75rem] border-0 bg-white dark:bg-neutral-900 shadow-sm dark:shadow-none">
              Loading tipline submissions...
            </div>
          ) : tipsList.length === 0 ? (
            <div className="p-12 text-center text-xs text-neutral-500 rounded-[1.75rem] border-0 bg-white dark:bg-neutral-900 space-y-2 shadow-sm dark:shadow-none">
              <MessageSquare className="h-8 w-8 text-neutral-400 dark:text-neutral-700 mx-auto" />
              <p>No tipline submissions received yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {tipsList.map((tip) => (
                <Card key={tip.id} className="p-6 rounded-[1.75rem] border-0 bg-white dark:bg-neutral-900 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
                    <div className="flex items-center gap-2.5">
                      <h3 className="font-bold text-base text-neutral-900 dark:text-white">{tip.subject}</h3>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatDate(tip.createdAt)}</span>
                    </div>
                  </div>

                  <p className="text-sm text-neutral-800 dark:text-neutral-300 leading-relaxed bg-neutral-100 dark:bg-neutral-900/60 p-4 rounded-xl font-mono text-xs whitespace-pre-line border border-neutral-200 dark:border-transparent">
                    {tip.details}
                  </p>

                  {tip.contactChannel && (
                    <div className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                      <UserCheck className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                      <span>Contact Info: <strong className="text-neutral-900 dark:text-neutral-200">{tip.contactChannel}</strong></span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                      <span className="capitalize">Status: <strong className="text-neutral-900 dark:text-neutral-300">{tip.status}</strong></span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {tip.status === "unread" && (
                        <Button
                          size="sm"
                          disabled={actionLoading === tip.id}
                          className="text-xs bg-brand hover:bg-brand-hover text-brand-ink font-bold cursor-pointer shadow-sm"
                          onClick={() => updateStatus(tip.id, "investigating")}
                        >
                          Investigate
                        </Button>
                      )}
                      {tip.status !== "dismissed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionLoading === tip.id}
                          className="text-xs border-neutral-300 text-neutral-700 hover:text-black dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-white cursor-pointer"
                          onClick={() => updateStatus(tip.id, "dismissed")}
                        >
                          Dismiss
                        </Button>
                      )}
                      {Boolean(
                        tip.contactChannel &&
                          (tip.contactChannel.includes("roblox:@") || tip.contactChannel.includes("uid:"))
                      ) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={actionLoading === tip.id}
                          className="text-xs gap-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/80 dark:hover:bg-red-900 dark:text-red-300 dark:border-red-800/60 font-semibold cursor-pointer"
                          onClick={() => handleBlacklist(tip)}
                        >
                          <Ban className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                          Blacklist
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminAuthGuard>
  );
}
