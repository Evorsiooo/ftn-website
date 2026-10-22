"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconX } from "@tabler/icons-react";
import { plusHref, watchPath } from "@/lib/plus-links";
import { usePlusNow } from "./plus-now-context";

const goldButtonClass =
  "inline-flex h-9 flex-none items-center justify-center rounded-lg bg-[#FFBB14] px-4 text-xs font-black text-black shadow-[0px_2px_0px_0px_#FFFFFF40_inset] transition hover:bg-[#e5a710] active:scale-[0.98]";

const STORAGE_KEY = "ftn_minibar_dismissed";
const SHOW_AFTER_MS = 5000;

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(-20) : [];
  } catch {
    return [];
  }
}

/**
 * Small bar at the bottom of the screen on phones, only while a stream is live. Each stream can be
 * dismissed for good, and it never appears on the homepage (the live hero is already there).
 */
export function PlusMiniBar() {
  const pathname = usePathname();
  const { data } = usePlusNow();
  const live = data.live[0];
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setDismissed(readDismissed());
    const t = setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  if (!live || !ready || pathname === "/" || dismissed.includes(live.id)) return null;

  const dismiss = () => {
    const next = [...dismissed, live.id];
    setDismissed(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  return (
    <div className="fixed inset-x-2.5 bottom-3 z-50 flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-2.5 pl-3 text-neutral-900 shadow-xl md:hidden dark:border-neutral-800 dark:bg-neutral-950 dark:text-white">
      <img src={live.thumbnailUrl} alt="" className="h-11 w-11 flex-none rounded-lg object-cover" />
      <div className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          Live
        </span>
        <div className="truncate text-[13px] font-bold">{live.title}</div>
      </div>
      <Link href={plusHref(watchPath(live.id), "minibar")} prefetch={false} className={goldButtonClass}>
        Watch
      </Link>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-white">
        <IconX className="h-4 w-4" />
      </button>
    </div>
  );
}
