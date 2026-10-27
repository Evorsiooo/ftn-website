"use client";
import { fetchSession } from "@/lib/session-client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shield, LogOut, Newspaper, ImageIcon } from "lucide-react";
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
      <Button variant="outline" size="sm" disabled className="text-xs">
        Sign In
      </Button>
    );
  }

  if (!user) {
    const signInHref = authMode === "credentials" ? "/auth/signin" : "/api/auth/roblox";

    return (
      <a href={signInHref}>
        <Button variant="outline" size="sm" className="text-xs font-semibold cursor-pointer">
          Sign In
        </Button>
      </a>
    );
  }

  const hasStaffRole = user.roles && user.roles.length > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 rounded-full border border-neutral-250 bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-900 hover:bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800 transition cursor-pointer"
      >
        <div className="h-6 w-6 rounded-full bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-white flex items-center justify-center font-bold text-[10px] overflow-hidden">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.robloxUsername} className="h-full w-full object-cover" />
          ) : (
            (user.robloxUsername || user.displayName).slice(0, 2).toUpperCase()
          )}
        </div>
        <span className="font-semibold text-neutral-900 dark:text-white">@{user.robloxUsername || user.displayName}</span>
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-xl dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:shadow-2xl z-50 space-y-3 p-3">
          <div className="border-b border-neutral-200 dark:border-neutral-850 pb-2">
            <div className="font-bold text-xs text-neutral-900 dark:text-white">@{user.robloxUsername}</div>
            {user.displayName && user.displayName !== user.robloxUsername && (
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{user.displayName}</div>
            )}
            {hasStaffRole && (
              <div className="text-[10px] text-[#00a9d2] font-semibold mt-1">
                {user.roles.map((r) => r.replace("_", " ")).join(", ")}
              </div>
            )}
          </div>

          <div className="space-y-1">
            {hasStaffRole && (
              <>
                <Link
                  href="/admin"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-neutral-700 hover:text-black hover:bg-neutral-100 dark:text-neutral-300 dark:hover:text-white dark:hover:bg-neutral-900 transition"
                >
                  <Shield className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                  Staff Administration
                </Link>

                <Link
                  href="/admin/articles"
                  onClick={() => setShowMenu(false)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-neutral-700 hover:text-black hover:bg-neutral-100 dark:text-neutral-300 dark:hover:text-white dark:hover:bg-neutral-900 transition"
                >
                  <Newspaper className="h-3.5 w-3.5 text-[#00a9d2]" />
                  Articles
                </Link>

                {canManagePosts(user.roles) && (
                  <Link
                    href="/admin/posts"
                    onClick={() => setShowMenu(false)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-neutral-700 hover:text-black hover:bg-neutral-100 dark:text-neutral-300 dark:hover:text-white dark:hover:bg-neutral-900 transition"
                  >
                    <ImageIcon className="h-3.5 w-3.5 text-[#00a9d2]" />
                    Posts
                  </Link>
                )}
              </>
            )}

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 transition cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
