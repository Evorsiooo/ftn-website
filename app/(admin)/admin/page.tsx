"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { fetchSession } from "@/lib/session-client";
import { fetchAdminSummary, type AdminSummary } from "@/lib/admin-summary";
import { ADMIN_MODULES } from "@/components/gs/admin-nav";
import { AdminPageHeader } from "@/components/gs/admin-header";
import { hhmm } from "@/lib/schedule-client";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900";
const pillLink =
  "mt-5 inline-flex h-10 items-center rounded-full px-5 text-sm font-bold transition";

function Stat({ label, value, note, href, action, hot }: { label: string; value: number; note: string; href: string; action: string; hot?: boolean }) {
  return (
    <div className={cn(card, hot && "border-[#16110a] bg-[#16110a] text-[#fff8e6] dark:border-black dark:bg-black")}>
      <div className={cn("text-xs font-bold uppercase tracking-widest", hot ? "text-[#fff8e6]/70" : "text-neutral-500")}>{label}</div>
      <div className={cn("gs-display mt-3 text-6xl font-extrabold leading-none", hot && "text-brand")}>{value}</div>
      <p className={cn("mt-2 text-sm", hot ? "text-[#fff8e6]/70" : "text-neutral-600 dark:text-neutral-400")}>{note}</p>
      <Link href={href} className={cn(pillLink, value > 0 ? "bg-brand text-brand-ink hover:bg-brand-hover" : "border border-neutral-300 hover:border-neutral-500 dark:border-neutral-700", hot && value === 0 && "border-[#fff8e6]/40")}>
        {action}
      </Link>
    </div>
  );
}

function when(d: Date): string {
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return same ? hhmm(d) : `${d.toLocaleDateString(undefined, { weekday: "short" })} ${hhmm(d)}`;
}

export default function AdminToday() {
  const [roles, setRoles] = useState<string[] | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);

  useEffect(() => {
    fetchSession()
      .then((data: any) => setRoles(data?.user?.roles || []))
      .catch(() => setRoles([]));
  }, []);

  useEffect(() => {
    if (!roles || roles.length === 0) return;
    fetchAdminSummary(roles).then(setSummary);
  }, [roles]);

  const modules = roles ? ADMIN_MODULES.filter((m) => m.allowed(roles)) : [];
  const stats = summary
    ? [
        summary.tips && { key: "tips", node: <Stat hot label="Tipline" value={summary.tips.unread} note={summary.tips.unread ? `unread, oldest ${summary.tips.oldestDays === 0 ? "today" : `${summary.tips.oldestDays} day${summary.tips.oldestDays === 1 ? "" : "s"} old`}` : "all leads handled"} href="/admin/tips" action={summary.tips.unread ? "Open inbox" : "View tipline"} /> },
        summary.posts && { key: "posts", node: <Stat label="Posts waiting" value={summary.posts.pending} note="awaiting approval" href="/admin/posts" action={summary.posts.pending ? "Review" : "View posts"} /> },
        summary.drafts && { key: "drafts", node: <Stat label="Drafts" value={summary.drafts.count} note={summary.drafts.stale ? `${summary.drafts.stale} untouched for over a week` : "none stale"} href="/admin/articles" action="Open articles" /> },
      ].filter(Boolean) as { key: string; node: React.ReactNode }[]
    : [];

  const hasAir = !!summary?.onAir;
  const hasAds = !!summary?.adsLow;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <AdminPageHeader title="Today" description="What needs you right now. You only see what your role can act on." />

      {!roles || (roles.length > 0 && !summary) ? (
        <div className="p-8 text-center text-sm text-neutral-500">Loading…</div>
      ) : (
        <>
          {stats.length > 0 && <div className={cn("grid gap-4", stats.length === 1 ? "grid-cols-1" : stats.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>{stats.map((s) => <React.Fragment key={s.key}>{s.node}</React.Fragment>)}</div>}

          {(hasAir || hasAds) && (
            <div className={cn("grid gap-4", hasAir && hasAds && "lg:grid-cols-[1.4fr_1fr]")}>
              {hasAir && summary!.onAir && (
                <div className={card}>
                  <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">On air and next</div>
                  <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
                    {summary!.onAir.current ? (
                      <li className="flex items-center justify-between gap-4 py-3">
                        <span className="flex items-center gap-2.5 font-bold">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-600" /> On air now · {summary!.onAir.current.title}
                        </span>
                        <span className="text-sm text-neutral-500">until {hhmm(summary!.onAir.current.end)}</span>
                      </li>
                    ) : (
                      <li className="py-3 text-sm text-neutral-500">Nothing on air right now.</li>
                    )}
                    {summary!.onAir.upcoming.map((o) => (
                      <li key={o.broadcastId + o.start.getTime()} className="flex items-center justify-between gap-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-brand" /> {o.title}
                        </span>
                        <span className="text-sm text-neutral-500">{when(o.start)}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/admin/radio" className={cn(pillLink, "border border-neutral-300 hover:border-neutral-500 dark:border-neutral-700")}>
                    Open schedule
                  </Link>
                </div>
              )}

              {hasAds && summary!.adsLow && (
                <div className={card}>
                  <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">Ads running low</div>
                  {summary!.adsLow.length === 0 ? (
                    <p className="mt-3 text-sm text-neutral-500">Every active ad has plenty of impressions left.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
                      {summary!.adsLow.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-4 py-3">
                          <span className="min-w-0 truncate">{a.organizer ? `${a.organizer} · ` : ""}{a.title}</span>
                          <span className="shrink-0 text-sm font-bold">{a.left} left</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link href="/admin/ads" className={cn(pillLink, "border border-neutral-300 hover:border-neutral-500 dark:border-neutral-700")}>
                    Open advertisements
                  </Link>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="mb-3 text-xs font-bold uppercase tracking-widest text-neutral-500">Everything you can open</div>
            <div className="flex flex-wrap gap-2">
              {modules.map((m) => (
                <Link key={m.href} href={m.href} className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-bold transition hover:border-brand hover:bg-brand/10 dark:border-neutral-700">
                  {m.title}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
