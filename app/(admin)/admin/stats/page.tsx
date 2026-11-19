"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { fetchSession } from "@/lib/session-client";
import { STATS_TABS, type StatsTab } from "@/lib/stats/access";
import { Body, PageBar, Screen, Seg } from "@/components/admin/ui";
import { PlusTab, PostsTab, RadioTab, SiteTab } from "@/components/admin/stats/tabs";

const RANGES = [
  { value: "1", label: "24 h" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

/** Stats: radio, website, FTN+, posts and ads. Each team sees the tabs for its own work. */
function StatsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [roles, setRoles] = useState<string[] | null>(null);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetchSession()
      .then((d: any) => setRoles(d?.user?.roles || []))
      .catch(() => setRoles([]));
  }, []);

  const tabs = useMemo(() => (roles ? STATS_TABS.filter((t) => t.allowed(roles)) : []), [roles]);
  const tab = (tabs.find((t) => t.key === params.get("tab")) ?? tabs[0])?.key as StatsTab | undefined;
  const days = RANGES.some((r) => r.value === params.get("days")) ? params.get("days")! : "30";
  const go = (next: { tab?: string; days?: string }) => {
    const q = new URLSearchParams({ tab: next.tab ?? tab ?? "", days: next.days ?? days });
    router.replace(`/admin/stats?${q}`, { scroll: false });
  };

  useEffect(() => {
    if (!tab) return;
    let live = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/stats?tab=${tab}&days=${days}`, { cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as any;
        if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
        return d;
      })
      .then((d) => live && setData({ ...d, tab }))
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [tab, days, tick]);

  const tabSeg = tabs.length > 1 ? <Seg value={tab ?? "radio"} onChange={(t) => go({ tab: t })} options={tabs.map((t) => ({ value: t.key, label: t.label }))} label="Show" /> : null;
  const rangeSeg = <Seg value={days} onChange={(d) => go({ days: d })} options={RANGES} label="Period" />;
  const shown = data && data.tab === tab && String(data.days) === days ? data : null;
  const n = Number(days);

  return (
    <Screen>
      <PageBar
        title="Stats"
        tools={
          <>
            {tabSeg}
            {rangeSeg}
          </>
        }
        end={
          <button type="button" className="btn icon" aria-label="Refresh" onClick={() => setTick((x) => x + 1)} disabled={loading}>
            <RefreshCw className={loading ? "ic spin" : "ic"} />
          </button>
        }
        mrow={
          <div style={{ display: "grid", gap: 8, width: "100%", minWidth: 0 }}>
            {tabSeg}
            {rangeSeg}
          </div>
        }
      />
      <Body scroll>
        {roles && tabs.length === 0 ? (
          <div className="pane-empty">Your role has no statistics to show.</div>
        ) : error ? (
          <div className="pane-empty">{error}</div>
        ) : !shown ? (
          <div className="pane-empty">Loading…</div>
        ) : tab === "radio" ? (
          <RadioTab data={shown} days={n} />
        ) : tab === "site" ? (
          <SiteTab data={shown} days={n} />
        ) : tab === "plus" ? (
          <PlusTab data={shown} days={n} />
        ) : (
          <PostsTab data={shown} days={n} onReport={(org) => router.push(`/admin/stats/report?org=${encodeURIComponent(org)}&days=${n < 7 ? 7 : n}`)} />
        )}
      </Body>
    </Screen>
  );
}

export default function AdminStatsPage() {
  return (
    <React.Suspense fallback={null}>
      <StatsPage />
    </React.Suspense>
  );
}
