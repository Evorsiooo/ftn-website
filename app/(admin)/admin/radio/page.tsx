"use client";
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader } from "@/components/gs/admin-header";
import { Button } from "@/components/ui/button";
import { canManageRadio } from "@/lib/rbac";
import { ApiBroadcast, BroadcastRecord, ShowRecord, parseBroadcast } from "@/lib/schedule-client";
import { ScheduleTab } from "@/components/admin/schedule/schedule-tab";
import { ShowsTab } from "@/components/admin/schedule/shows-tab";
import { OnAirStrip } from "@/components/admin/schedule/on-air-strip";

export default function AdminSchedulePage() {
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showsOpen, setShowsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/broadcasts");
      if (res.ok) {
        const data = (await res.json()) as { shows: ShowRecord[]; broadcasts: ApiBroadcast[] };
        setShows(data.shows || []);
        setBroadcasts((data.broadcasts || []).map(parseBroadcast));
      }
    } catch (err) {
      console.error("Failed to load schedule:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminAuthGuard requiredPermission={canManageRadio} featureTitle="Broadcast Schedule">
      <div className="mx-auto max-w-7xl space-y-6 text-neutral-900 dark:text-white">
        <AdminPageHeader
          title="Schedule"
          description="Click an empty slot to add a broadcast. Click a block to edit it."
          actions={
            <>
              <Link href="/plus/schedule" className="gs-bar-link pb-0.5 text-sm font-bold">
                View public schedule →
              </Link>
              <Button size="sm" onClick={() => setShowsOpen(true)} className="h-10 cursor-pointer px-5 text-sm">
                Shows &amp; presenters
              </Button>
            </>
          }
        />

        <OnAirStrip shows={shows} broadcasts={broadcasts} />
        <ScheduleTab shows={shows} broadcasts={broadcasts} reload={load} />
      </div>

      {showsOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={() => setShowsOpen(false)}>
          <aside
            role="dialog"
            aria-label="Shows and presenters"
            className="absolute inset-y-0 right-0 flex w-full max-w-4xl flex-col overflow-y-auto border-l border-border bg-background text-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-brand px-6 py-5 text-brand-ink">
              <h2 className="text-xl font-extrabold">Shows &amp; presenters</h2>
              <button type="button" onClick={() => setShowsOpen(false)} aria-label="Close" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#16110a] text-[#fff8e6] hover:bg-black">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6">
              <ShowsTab shows={shows} loading={loading} reload={load} />
            </div>
          </aside>
        </div>
      )}
    </AdminAuthGuard>
  );
}
