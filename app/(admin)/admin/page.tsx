"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { fetchSession } from "@/lib/session-client";
import { ADMIN_MODULES } from "@/components/gs/admin-nav";
import { AdminPageHeader } from "@/components/gs/admin-header";
import { cn } from "@/lib/utils";

const TONES = [
  "bg-brand text-brand-ink",
  "bg-white text-neutral-900 border border-neutral-200 dark:bg-neutral-900 dark:text-white dark:border-neutral-800",
  "bg-[#16110a] text-[#fff8e6] dark:bg-black",
  "bg-white text-neutral-900 border border-neutral-200 dark:bg-neutral-900 dark:text-white dark:border-neutral-800",
];

export default function AdminCentralDashboard() {
  const [roles, setRoles] = useState<string[] | null>(null);

  useEffect(() => {
    fetchSession()
      .then((data: any) => setRoles(data?.user?.roles || []))
      .catch(() => setRoles([]));
  }, []);

  const modules = roles ? ADMIN_MODULES.filter((m) => m.allowed(roles)) : [];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <AdminPageHeader title="Admin portal" description="Authorized management consoles matching your staff permissions." />

      {!roles ? (
        <div className="p-8 text-center text-sm text-neutral-500">Loading authorized modules...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {modules.map((m, i) => (
            <Link
              key={m.href}
              href={m.href}
              className={cn(
                "group flex min-h-[210px] flex-col justify-between gap-8 rounded-[1.75rem] p-6 transition hover:-translate-y-0.5",
                TONES[i % TONES.length],
                i === 0 && "sm:col-span-2"
              )}
            >
              <span className="text-2xl transition group-hover:translate-x-1">→</span>
              <div>
                <h2 className="text-2xl font-extrabold leading-tight">{m.title}</h2>
                <p className="mt-1.5 text-sm opacity-75">{m.description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
