"use client";
import { fetchSession } from "@/lib/session-client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shield, LogOut, Newspaper, ImageIcon, ChevronDown } from "lucide-react";
import { canManagePosts } from "@/lib/rbac";

export function AuthButton({ allowSignIn = true }: { allowSignIn?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<{
    displayName: string;
    robloxUsername: string;
    avatarUrl?: string;
    roles: string[];
  } | null>(null);
  const [authMode, setAuthMode] = useState<"roblox" | "credentials">("roblox");
  const [allowSignInState, setAllowSignInState] = useState(allowSignIn);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showMenu]);

  useEffect(() => {
    setMounted(true);
    // Fetch session
    fetchSession()
      .then((data: any) => {
        if (data && data.authenticated && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    // Fetch auth mode
    fetch("/api/auth/mode")
      .then((res) => res.json())
      .then((data: any) => {
        if (data) {
          if (data.mode) setAuthMode(data.mode);
          if (typeof data.allowSignIn === "boolean") setAllowSignInState(data.allowSignIn);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.reload();
  };

  if (!mounted || loading) {
    return (
      <Button variant="outline" size="sm" disabled className="h-9 border-brand-ink/40 px-4 text-xs font-bold !text-brand-ink">
        Sign In
      </Button>
    );
  }

  if (!user) {
    const signInHref = authMode === "credentials" ? "/auth/signin" : "/api/auth/roblox";

    return (
      <a href={signInHref}>
        <Button variant="outline" size="sm" className="h-9 cursor-pointer border-2 border-brand-ink/80 px-4 text-xs font-bold !text-brand-ink hover:!bg-brand-ink/10">
          Sign In
        </Button>
      </a>
    );
  }

  const hasStaffRole = user.roles && user.roles.length > 0;
  const name = user.robloxUsername || user.displayName;
  const initials = name.slice(0, 2).toUpperCase();
  const tiles = [
    ...(hasStaffRole
      ? [
          { href: "/admin", label: "Admin", icon: Shield },
          { href: "/admin/articles", label: "Articles", icon: Newspaper },
          ...(canManagePosts(user.roles) ? [{ href: "/admin/posts", label: "Posts", icon: ImageIcon }] : []),
        ]
      : []),
  ];

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        aria-haspopup="menu"
        aria-expanded={showMenu}
        className="flex h-9 cursor-pointer items-center gap-2 rounded-full bg-[#16110a] py-0 pl-1.5 pr-3 text-xs font-medium text-[#fff8e6] transition hover:bg-black"
      >
        <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-brand text-[10px] font-bold text-brand-ink">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
        </span>
        <span className="font-semibold">@{name}</span>
        <ChevronDown className={`h-3.5 w-3.5 opacity-70 transition ${showMenu ? "rotate-180" : ""}`} />
      </button>

      {showMenu && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-3 w-72 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
        >
          <div className="flex items-center gap-3 bg-brand p-4 text-brand-ink">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-brand-ink/80 bg-[#16110a] text-lg font-bold text-[#fff8e6]">
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-base font-extrabold leading-tight">{user.displayName || name}</div>
              <div className="truncate text-xs font-medium opacity-80">@{user.robloxUsername}</div>
            </div>
          </div>

          {hasStaffRole && (
            <div className="flex flex-wrap gap-1.5 px-4 pt-3">
              {user.roles.map((r) => (
                <span key={r} className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold capitalize text-foreground">
                  {r.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}

          {tiles.length > 0 && (
            <div className="grid grid-cols-3 gap-2 p-4">
              {tiles.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  onClick={() => setShowMenu(false)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background px-2 py-3 text-xs font-semibold transition hover:border-brand hover:bg-brand/10"
                >
                  <Icon className="h-5 w-5 text-brand-text" />
                  {label}
                </Link>
              ))}
            </div>
          )}

          <button
            role="menuitem"
            onClick={handleLogout}
            className={`flex w-full cursor-pointer items-center justify-between border-t border-border px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-500/10 dark:text-red-400 ${tiles.length === 0 ? "mt-3" : ""}`}
          >
            Sign out
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
