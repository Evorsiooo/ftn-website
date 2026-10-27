"use client";
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader, AdminTab } from "@/components/gs/admin-header";
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
      <div className="mx-auto max-w-7xl space-y-8 text-neutral-900 dark:text-white">
        <AdminPageHeader
          title="Schedule"
          description="Schedule radio shows and livestreams, manage shows and the broadcast password."
          actions={
            <Link href="/plus/schedule" className="gs-bar-link pb-0.5 text-sm font-bold">
              View public schedule →
            </Link>
          }
          tabs={TABS.map((t) => (
            <AdminTab key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </AdminTab>
          ))}
        />

        {tab === "schedule" && <ScheduleTab shows={shows} broadcasts={broadcasts} reload={load} />}
        {tab === "shows" && <ShowsTab shows={shows} loading={loading} reload={load} />}
        {tab === "station" && <StationTab />}
      </div>
    </AdminAuthGuard>
  );
}
