"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { fetchSession } from "@/lib/session-client";
import { ADMIN_MODULES } from "@/components/gs/admin-nav";
import { AdminPageHeader } from "@/components/gs/admin-header";

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
          {modules.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="group flex min-h-[180px] flex-col justify-between gap-8 rounded-2xl border border-border bg-card p-6 text-card-foreground transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-lg text-brand-ink transition group-hover:translate-x-1">→</span>
              <div>
                <h2 className="text-xl font-extrabold leading-tight">{m.title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{m.description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
