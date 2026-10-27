"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchSession } from "@/lib/session-client";
import { ADMIN_MODULES } from "./admin-nav";
import { cn } from "@/lib/utils";

/** The admin frame: a sidebar of the areas the signed-in staff member may open, and the page beside it. */
export function GsAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [roles, setRoles] = useState<string[] | null>(null);

  useEffect(() => {
    fetchSession()
      .then((data: any) => setRoles(data?.user?.roles || []))
      .catch(() => setRoles([]));
  }, []);

  const modules = roles ? ADMIN_MODULES.filter((m) => m.allowed(roles)) : [];
  const items = [{ title: "Overview", href: "/admin" }, ...modules];
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col gap-0 lg:flex-row">
      <aside className="border-b border-neutral-200 dark:border-neutral-800 lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <nav
          aria-label="Admin"
          className="flex gap-1 overflow-x-auto px-4 py-3 lg:sticky lg:top-16 lg:flex-col lg:overflow-visible lg:px-4 lg:py-8"
        >
          <div className="hidden px-3 pb-3 text-xs font-bold uppercase tracking-widest text-neutral-500 lg:block">Admin</div>
          {items.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              aria-current={active(m.href) ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-4 py-2.5 text-sm font-bold transition",
                active(m.href)
                  ? "bg-brand text-brand-ink"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white"
              )}
            >
              {m.title}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
