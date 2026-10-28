"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { fetchSession } from "@/lib/session-client";
import { fetchAdminSummary, type AdminSummary } from "@/lib/admin-summary";
import { ADMIN_MODULES, GROUP_ORDER, SETTINGS_PAGES, SETTINGS_SECTIONS, type AdminBadge } from "./admin-nav";
import { cn } from "@/lib/utils";

function badgeCount(summary: AdminSummary | null, key?: AdminBadge): number {
  if (!summary || !key) return 0;
  if (key === "tips") return summary.tips?.unread ?? 0;
  if (key === "posts") return summary.posts?.pending ?? 0;
  return summary.drafts?.count ?? 0;
}

/** The admin frame: a sidebar grouped by job with live counts, a jump bar, and the page beside it. */
export function GsAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [roles, setRoles] = useState<string[] | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);

  useEffect(() => {
    fetchSession()
      .then((data: any) => setRoles(data?.user?.roles || []))
      .catch(() => setRoles([]));
  }, []);

  useEffect(() => {
    if (!roles || roles.length === 0) return;
    let live = true;
    fetchAdminSummary(roles).then((s) => live && setSummary(s));
    return () => {
      live = false;
    };
  }, [roles, pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setJumpOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const modules = useMemo(() => (roles ? ADMIN_MODULES.filter((m) => m.allowed(roles)) : []), [roles]);
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/"));
  const inSettings = pathname.startsWith("/admin/settings");

  const linkClass = (on: boolean) =>
    cn(
      "flex shrink-0 items-center justify-between gap-3 rounded-full px-4 py-2.5 text-sm font-bold transition",
      on ? "bg-brand text-brand-ink" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white"
    );

  return (
    <div className="flex w-full flex-1 flex-col gap-0 lg:flex-row">
      <aside className="border-b border-neutral-200 dark:border-neutral-800 lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto overflow-y-hidden px-4 py-3 lg:sticky lg:top-16 lg:flex-col lg:overflow-visible lg:px-4 lg:py-6">
          <button
            type="button"
            onClick={() => setJumpOpen(true)}
            className="mb-2 hidden cursor-pointer items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-left text-sm text-neutral-500 transition hover:border-neutral-500 dark:border-neutral-700 lg:flex"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1">Jump to…</span>
            <kbd className="rounded bg-neutral-900 px-1.5 text-xs text-white dark:bg-white dark:text-black">/</kbd>
          </button>

          <Link href="/admin" aria-current={active("/admin") ? "page" : undefined} className={linkClass(active("/admin"))}>
            Today
          </Link>

          {GROUP_ORDER.map((group) => {
            const items = modules.filter((m) => m.group === group);
            if (items.length === 0) return null;
            return (
              <React.Fragment key={group}>
                <div className="hidden px-4 pb-1 pt-4 text-xs font-bold uppercase tracking-widest text-neutral-500 lg:block">{group}</div>
                {items.map((m) => {
                  const n = badgeCount(summary, m.badge);
                  const isActive = active(m.href);
                  return (
                    <React.Fragment key={m.href}>
                      <Link href={m.href} aria-current={isActive ? "page" : undefined} className={linkClass(isActive)}>
                        {m.title}
                        {n > 0 && (
                          <span className={cn("rounded-full px-2 text-xs font-extrabold", isActive ? "bg-[#16110a] text-[#fff8e6]" : "bg-brand text-brand-ink")}>{n}</span>
                        )}
                      </Link>
                      {m.href === "/admin/settings" && inSettings &&
                        SETTINGS_PAGES.map((s) => (
                          <Link
                            key={s.href}
                            href={s.href}
                            aria-current={pathname === s.href ? "page" : undefined}
                            className={cn(
                              "hidden rounded-full py-1.5 pl-8 pr-4 text-sm font-semibold transition lg:block",
                              pathname === s.href ? "text-neutral-900 dark:text-white" : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                            )}
                          >
                            <span className={cn("mr-2 inline-block h-1.5 w-1.5 rounded-full", pathname === s.href ? "bg-brand" : "bg-neutral-300 dark:bg-neutral-700")} />
                            {s.title}
                          </Link>
                        ))}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
        </nav>
      </aside>
      <div className={cn("min-w-0 flex-1")}>{children}</div>
      {jumpOpen && <JumpBar modules={modules} onClose={() => setJumpOpen(false)} />}
    </div>
  );
}

function JumpBar({ modules, onClose }: { modules: typeof ADMIN_MODULES; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(
    () => [
      { title: "Today", hint: "What needs you now", href: "/admin" },
      ...modules.map((m) => ({ title: m.title, hint: m.description, href: m.href })),
      ...(modules.some((m) => m.href === "/admin/settings") ? SETTINGS_PAGES.filter((s) => s.href !== "/admin/settings").map((s) => ({ title: `Settings: ${s.title}`, hint: s.description, href: s.href })) : []),
      ...(modules.some((m) => m.href === "/admin/settings") ? SETTINGS_SECTIONS.map((s) => ({ title: `Setting: ${s.title}`, hint: "Opens its settings page", href: s.href })) : []),
    ],
    [modules]
  );
  const needle = q.trim().toLowerCase();
  const pageResults = entries.filter((e) => `${e.title} ${e.hint}`.toLowerCase().includes(needle));

  // Stories and people are looked up as you type, for the roles you can open.
  const canStories = modules.some((m) => m.href === "/admin/articles");
  const canPeople = modules.some((m) => m.href === "/admin/roles");
  const [stories, setStories] = useState<{ title: string; slug: string; status: string }[] | null>(null);
  const canShows = modules.some((m) => m.href === "/admin/radio");
  const [shows, setShows] = useState<{ title: string; hint: string; href: string }[] | null>(null);
  useEffect(() => {
    if (!canShows || needle.length < 2 || shows) return;
    fetch("/api/admin/broadcasts")
      .then((r) => r.json() as Promise<{ shows?: any[] }>)
      .then((d) => setShows((d.shows ?? []).map((sh) => ({ title: sh.name, hint: `Show${sh.presenter ? ` · ${sh.presenter}` : ""}`, href: "/admin/radio" }))))
      .catch(() => setShows([]));
  }, [canShows, needle, shows]);
  const [people, setPeople] = useState<{ title: string; hint: string; href: string }[]>([]);

  useEffect(() => {
    if (!canStories || needle.length < 2 || stories) return;
    fetch("/api/articles?admin=true")
      .then((r) => r.json() as Promise<{ articles?: any[] }>)
      .then((d) => setStories((d.articles ?? []).map((a) => ({ title: a.title, slug: a.slug, status: a.status }))))
      .catch(() => setStories([]));
  }, [canStories, needle, stories]);

  useEffect(() => {
    if (!canPeople || needle.length < 2) {
      setPeople([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/users?search=${encodeURIComponent(needle)}`)
        .then((r) => r.json() as Promise<{ users?: any[] }>)
        .then((d) => setPeople((d.users ?? []).slice(0, 5).map((u) => ({ title: u.displayName || u.robloxUsername, hint: `@${u.robloxUsername} · staff roles`, href: `/admin/roles?q=${encodeURIComponent(u.robloxUsername)}` }))))
        .catch(() => setPeople([]));
    }, 250);
    return () => clearTimeout(t);
  }, [canPeople, needle]);

  const storyResults = needle.length < 2 ? [] : (stories ?? []).filter((a) => a.title.toLowerCase().includes(needle)).slice(0, 5).map((a) => ({ title: a.title, hint: `Story · ${a.status}`, href: `/admin/articles?edit=${encodeURIComponent(a.slug)}` }));
  const showResults = needle.length < 2 ? [] : (shows ?? []).filter((x) => `${x.title} ${x.hint}`.toLowerCase().includes(needle)).slice(0, 5);
  const results = [...pageResults, ...storyResults, ...showResults, ...people];

  useEffect(() => inputRef.current?.focus(), []);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-start justify-center bg-black/60 p-4 pt-[14vh] backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Jump to"
        className="w-full max-w-lg overflow-hidden rounded-3xl bg-white text-neutral-900 shadow-2xl dark:bg-neutral-900 dark:text-white"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, results.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(i - 1, 0));
          }
          if (e.key === "Enter" && results[index]) go(results[index].href);
        }}
      >
        <div className="h-2 bg-brand" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIndex(0);
          }}
          placeholder="Jump to a page, setting, story or person"
          className="h-14 w-full bg-transparent px-5 text-base font-semibold outline-none"
        />
        <ul className="max-h-80 divide-y divide-neutral-200 overflow-y-auto border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {results.length === 0 && <li className="px-5 py-4 text-sm text-neutral-500">Nothing matches.</li>}
          {results.map((r, i) => (
            <li key={r.href + r.title}>
              <button
                type="button"
                onClick={() => go(r.href)}
                onMouseEnter={() => setIndex(i)}
                className={cn("block w-full cursor-pointer px-5 py-3 text-left", i === index && "bg-brand/20")}
              >
                <div className="text-sm font-bold">{r.title}</div>
                <div className="text-xs text-neutral-500">{r.hint}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
