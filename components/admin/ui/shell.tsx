"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, Menu, Moon, Search, Sun, X } from "lucide-react";
import { fetchSession } from "@/lib/session-client";
import { fetchAdminSummary, type AdminSummary } from "@/lib/admin-summary";
import { useTheme } from "@/lib/theme-context";
import { ADMIN_MODULES, GROUP_ORDER, SETTINGS_PAGES, SETTINGS_SECTIONS, type AdminBadge } from "@/components/gs/admin-nav";
import { cn } from "@/lib/utils";

function badgeCount(summary: AdminSummary | null, key?: AdminBadge): number {
  if (!summary || !key) return 0;
  if (key === "tips") return summary.tips?.unread ?? 0;
  if (key === "posts") return summary.posts?.pending ?? 0;
  if (key === "imports") return summary.imports?.review ?? 0;
  if (key === "reports") return summary.reports?.new ?? 0;
  return summary.drafts?.count ?? 0;
}

type Me = { displayName?: string; robloxUsername?: string; avatarUrl?: string; roles: string[] };

export const ROLE_LABELS: Record<string, string> = {
  site_admin: "Site admin",
  manager: "Operations manager",
  broadcast_division: "Broadcast",
  digital_publishing: "Digital publishing",
  commercial_division: "Commercial and ads",
  graphic_design: "Graphic design",
  sports_division: "Sports",
};

function roleLabel(roles: string[]): string {
  const first = roles[0];
  if (!first) return "Staff";
  return ROLE_LABELS[first] ?? first.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

/** The admin frame: sidebar (own scroll), and the page beside it. On phones the sidebar opens from a top bar. */
export function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    fetchSession()
      .then((data: any) => setMe(data?.user ? { ...data.user, roles: data.user.roles || [] } : { roles: [] }))
      .catch(() => setMe({ roles: [] }));
  }, []);

  const roles = me?.roles ?? null;
  useEffect(() => {
    if (!roles || roles.length === 0) return;
    let live = true;
    const load = () => fetchAdminSummary(roles).then((s) => live && setSummary(s));
    load();
    // Refresh once a minute while the tab is visible; a hidden tab waits, and catches up when shown again.
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    const onShow = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      live = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [roles, pathname]);

  useEffect(() => setMenu(false), [pathname]);

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
  const under = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const owns = (m: (typeof ADMIN_MODULES)[number]) => under(m.href) || (m.also ?? []).some(under);
  // The deepest matching entry wins.
  const activeHref = useMemo(() => {
    // by the longest path that matched, so /admin/radio/reports beats Song library's "also" /admin/radio
    const depth = (m: (typeof ADMIN_MODULES)[number]) => Math.max(...[m.href, ...(m.also ?? [])].filter(under).map((h) => h.length), -1);
    const hits = modules.filter(owns).sort((a, b) => depth(b) - depth(a));
    return hits[0]?.href ?? (pathname === "/admin" ? "/admin" : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, pathname]);

  const onAir = summary?.onAir?.current ?? null;
  const studioHref = onAir ? `/admin/schedule/studio?b=${encodeURIComponent(onAir.broadcastId)}&at=${onAir.start.getTime()}` : "/admin/schedule";

  return (
    <div className={cn("adm-app", menu && "menu")}>
      <div className="adm-mtop">
        <button type="button" className="iconbtn" aria-label={menu ? "Close menu" : "Menu"} onClick={() => setMenu((v) => !v)}>
          {menu ? <X className="ic" /> : <Menu className="ic" />}
        </button>
        <Link href="/admin" aria-label="Admin home">
          <img src="/logos/ftn_text_transparent.png" alt="FTN" className="dark:hidden" />
          <img src="/logos/ftn_textwhite_transparent.png" alt="FTN" className="hidden dark:block" />
        </Link>
        <button type="button" className="iconbtn" aria-label="Jump to" onClick={() => setJumpOpen(true)} style={{ marginLeft: onAir ? 0 : "auto" }}>
          <Search className="ic" />
        </button>
        {onAir && (
          <Link className="live-mini" href={studioHref}>
            <span className="dot red" />
            On air
          </Link>
        )}
      </div>

      <aside className="adm-side">
        <Link href="/admin" className="adm-side-top hide-m">
          <img src="/logos/ftn_text_transparent.png" alt="FTN" className="dark:hidden" />
          <img src="/logos/ftn_textwhite_transparent.png" alt="FTN" className="hidden dark:block" />
          <span className="lbl">Admin</span>
        </Link>
        <button type="button" className="adm-jump" onClick={() => setJumpOpen(true)}>
          <Search className="ic" />
          Jump to
          <kbd>/</kbd>
        </button>
        <nav className="adm-nav" aria-label="Admin">
          <Link href="/admin" className={cn(pathname === "/admin" && "on")} aria-current={pathname === "/admin" ? "page" : undefined}>
            Today
          </Link>
          {GROUP_ORDER.map((group) => {
            const items = modules.filter((m) => m.group === group);
            if (items.length === 0) return null;
            return (
              <React.Fragment key={group}>
                <div className="grp">{group}</div>
                {items.map((m) => {
                  const n = badgeCount(summary, m.badge);
                  const on = activeHref === m.href;
                  return (
                    <Link key={m.href} href={m.href} className={cn(on && "on")} aria-current={on ? "page" : undefined}>
                      {m.title}
                      {n > 0 && <span className="cnt">{n}</span>}
                    </Link>
                  );
                })}
              </React.Fragment>
            );
          })}
        </nav>
        {onAir && (
          <Link className="adm-live" href={studioHref}>
            <span className="row" style={{ fontWeight: 600 }}>
              <span className="dot red" />
              <span className="trunc">On air · {onAir.title}</span>
            </span>
            <span className="row t12 muted">
              Until {fmtTime(onAir.end)}
              {onAir.presenter ? ` · ${onAir.presenter}` : ""}
            </span>
          </Link>
        )}
        <div className="adm-side-foot">
          {me?.avatarUrl ? <img className="avatar" src={me.avatarUrl} alt="" /> : <span className="avatar" />}
          <div className="trunc" style={{ flex: 1 }}>
            <div className="trunc" style={{ fontWeight: 600 }}>
              {me?.displayName || me?.robloxUsername || " "}
            </div>
            <div className="t12 muted trunc">{roles ? roleLabel(roles) : " "}</div>
          </div>
          <Link className="iconbtn" href="/" title="View site" aria-label="View site">
            <ExternalLink className="ic" />
          </Link>
          <button
            type="button"
            className="iconbtn"
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={(e) => toggleTheme({ x: e.clientX, y: e.clientY })}
          >
            {theme === "dark" ? <Sun className="ic" /> : <Moon className="ic" />}
          </button>
        </div>
      </aside>

      <main className="adm-main">{children}</main>
      {jumpOpen && <JumpBar modules={modules} onClose={() => setJumpOpen(false)} />}
    </div>
  );
}

type Hit = { title: string; hint: string; href: string; kind: string };

function JumpBar({ modules, onClose }: { modules: typeof ADMIN_MODULES; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const has = (href: string) => modules.some((m) => m.href === href);

  const entries: Hit[] = useMemo(
    () => [
      { title: "Today", hint: "What needs you now", href: "/admin", kind: "Page" },
      ...modules.map((m) => ({ title: m.title, hint: m.description, href: m.href, kind: "Page" })),
      ...(has("/admin/posts") ? [{ title: "New post", hint: "Open the Creator", href: "/admin/posts/creator", kind: "Action" }] : []),
      ...(has("/admin/schedule") ? [{ title: "Studio", hint: "Go on air", href: "/admin/schedule/studio", kind: "Page" }] : []),
      ...(has("/admin/radio/library") ? [{ title: "Song ratings", hint: "What listeners voted", href: "/admin/radio/library?tab=ratings", kind: "Page" }] : []),
      ...(has("/admin/settings") ? SETTINGS_PAGES.map((s) => ({ title: `Settings: ${s.title}`, hint: s.description, href: s.href, kind: "Settings" })) : []),
      ...(has("/admin/settings") ? SETTINGS_SECTIONS.map((s) => ({ title: s.title, hint: "Setting", href: s.href, kind: "Setting" })) : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modules]
  );
  const needle = q.trim().toLowerCase();
  const pageResults = entries.filter((e) => `${e.title} ${e.hint}`.toLowerCase().includes(needle));

  const canStories = has("/admin/articles");
  const canPeople = has("/admin/people");
  const canShows = has("/admin/schedule");
  const [stories, setStories] = useState<{ title: string; slug: string; status: string }[] | null>(null);
  const [shows, setShows] = useState<Hit[] | null>(null);
  const [people, setPeople] = useState<Hit[]>([]);

  useEffect(() => {
    if (!canShows || needle.length < 2 || shows) return;
    fetch("/api/admin/broadcasts")
      .then((r) => r.json() as Promise<{ shows?: any[] }>)
      .then((d) => setShows((d.shows ?? []).map((sh) => ({ title: sh.name, hint: sh.presenter || "Show", href: `/admin/schedule?show=${encodeURIComponent(sh.id)}`, kind: "Show" }))))
      .catch(() => setShows([]));
  }, [canShows, needle, shows]);

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
        .then((d) =>
          setPeople((d.users ?? []).slice(0, 5).map((u) => ({ title: u.displayName || u.robloxUsername, hint: `@${u.robloxUsername}`, href: `/admin/people?q=${encodeURIComponent(u.robloxUsername)}`, kind: "Person" })))
        )
        .catch(() => setPeople([]));
    }, 250);
    return () => clearTimeout(t);
  }, [canPeople, needle]);

  const storyResults: Hit[] =
    needle.length < 2
      ? []
      : (stories ?? [])
          .filter((a) => a.title.toLowerCase().includes(needle))
          .slice(0, 5)
          .map((a) => ({ title: a.title, hint: a.status, href: `/admin/articles?edit=${encodeURIComponent(a.slug)}`, kind: "Article" }));
  const showResults = needle.length < 2 ? [] : (shows ?? []).filter((x) => `${x.title} ${x.hint}`.toLowerCase().includes(needle)).slice(0, 5);
  const results = [...pageResults, ...storyResults, ...showResults, ...people];

  useEffect(() => inputRef.current?.focus(), []);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="adm-jumpbar-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-label="Jump to"
        className="adm-jumpbar"
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
        <div className="q">
          <Search className="ic faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            placeholder="Jump to a page, setting, article, show or person"
          />
          <span className="kbd">Esc</span>
        </div>
        <ul>
          {results.length === 0 && <li className="empty">Nothing matches.</li>}
          {results.map((r, i) => (
            <li key={r.kind + r.href + r.title}>
              <button type="button" className={cn(i === index && "on")} onClick={() => go(r.href)} onMouseEnter={() => setIndex(i)}>
                <span className="trunc">
                  <span style={{ fontWeight: 600 }}>{r.title}</span>
                  <span className="muted t12" style={{ marginLeft: 8 }}>
                    {r.hint}
                  </span>
                </span>
                <span className="kind">{r.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
