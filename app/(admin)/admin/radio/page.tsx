"use client";
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canManageRadio } from "@/lib/rbac";
import { ApiBroadcast, BroadcastRecord, ShowRecord, parseBroadcast } from "@/lib/schedule-client";
import { ScheduleTab } from "@/components/admin/schedule/schedule-tab";
import { ShowsTab } from "@/components/admin/schedule/shows-tab";
import { StationTab } from "@/components/admin/schedule/station-tab";

const TABS = [
  { id: "schedule", label: "Schedule" },
  { id: "shows", label: "Shows" },
  { id: "station", label: "Station" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function AdminSchedulePage() {
  const [tab, setTab] = useState<TabId>("schedule");
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 pt-24 sm:pt-28 pb-12 space-y-6 text-neutral-900 dark:text-white">
        <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight flex items-center gap-2.5">
              <CalendarDays className="h-7 w-7 text-blue-600 dark:text-blue-400" /> Schedule
            </h1>
            <Link href="/plus/schedule" className="text-xs font-semibold underline">
              View public schedule
            </Link>
          </div>
          <div className="flex gap-1 mt-4" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 text-xs font-bold rounded-md cursor-pointer transition ${
                  tab === t.id
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "schedule" && <ScheduleTab shows={shows} broadcasts={broadcasts} reload={load} />}
        {tab === "shows" && <ShowsTab shows={shows} loading={loading} reload={load} />}
        {tab === "station" && <StationTab />}
      </div>
    </AdminAuthGuard>
  );
}
