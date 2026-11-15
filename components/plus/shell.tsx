"use client";
// The FTN+ chrome: the same top bar on every page, and on phones the bottom tab bar (five places, with Sports and
// Saved under More). The approved mockups' shell, on real data.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as I from "./icons";

export type PlusUser = { displayName?: string; avatarUrl?: string | null } | null;

const NAV: [string, string][] = [
  ["Home", "/plus"],
  ["Videos", "/plus/videos"],
  ["Radio", "/plus/radio"],
  ["Schedule", "/plus/schedule"],
  ["Sports", "/plus/sports"],
  ["Saved", "/plus/saved"],
];

export function isCurrent(pathname: string, href: string) {
  if (href === "/plus") return pathname === "/plus";
  return pathname === href || pathname.startsWith(href + "/") || (href === "/plus/videos" && pathname.startsWith("/plus/watch"));
}

function Account({ user }: { user: PlusUser }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const pathname = usePathname() || "/plus";
  if (!user) return <a href={`/api/auth/roblox?returnUrl=${encodeURIComponent(pathname)}`}>Sign in</a>;
  const initial = (user.displayName || "?").slice(0, 1).toUpperCase();
  return (
    <div className="acct" ref={box}>
      <button className="avatar" aria-label="Your account" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initial}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="who">{user.displayName}</div>
          <button
            role="menuitem"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
              window.location.reload();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ user }: { user: PlusUser }) {
  const pathname = usePathname() || "";
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`top${solid ? " solid" : ""}`}>
      <Link href="/plus" className="logo" aria-label="FTN+ home">
        <img src="/logos/ftnplus_textwhite_transparent.png" alt="FTN+" />
      </Link>
      <nav className="nav" aria-label="FTN+">
        {NAV.map(([label, href]) => (
          <Link key={href} href={href} aria-current={isCurrent(pathname, href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="right">
        <Link href="/" className="back">
          Back to FTN
        </Link>
        <Account user={user} />
      </div>
    </header>
  );
}

export function PhoneTabs() {
  const pathname = usePathname() || "";
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);
  const tab = (label: string, href: string, Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement) => (
    <Link href={href} aria-current={isCurrent(pathname, href) ? "page" : undefined}>
      <Icon />
      {label}
    </Link>
  );
  const inMore = isCurrent(pathname, "/plus/sports") || isCurrent(pathname, "/plus/saved");
  return (
    <>
      <div className={`moresheet${more ? " open" : ""}`}>
        <Link href="/plus/sports">Sports</Link>
        <Link href="/plus/saved">Saved</Link>
        <Link href="/">Back to FTN</Link>
      </div>
      <nav className="tabsbar" aria-label="FTN+">
        {tab("Home", "/plus", I.Home)}
        {tab("Videos", "/plus/videos", I.Grid)}
        {tab("Radio", "/plus/radio", I.Radio)}
        {tab("Schedule", "/plus/schedule", I.Calendar)}
        <button aria-expanded={more} aria-current={inMore ? "page" : undefined} onClick={() => setMore((m) => !m)}>
          <I.More />
          More
        </button>
      </nav>
    </>
  );
}
