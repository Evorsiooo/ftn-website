"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Copy, RefreshCw, Loader2 } from "lucide-react";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import { expandOccurrences } from "@/lib/schedule-core";
import type { Occurrence } from "@/lib/schedule-core";
import { fmtTime } from "@/lib/schedule-client";
import type { BroadcastRecord, ShowRecord } from "@/lib/schedule-client";

interface PasswordInfo {
  password: string | null;
  lastRotatedAt: number | null;
  rotationFrequencyHours: number;
  rotationTimeUtc: string;
  rotationConfigured: boolean;
}

/** Top of the Schedule page: what is on air, and the broadcast password where the DJ needs it. */
export function OnAirStrip({ shows, broadcasts }: { shows: ShowRecord[]; broadcasts: BroadcastRecord[] }) {
  const [now, setNow] = useState(() => new Date());
  const [pw, setPw] = useState<PasswordInfo | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/radio/password");
      if (res.ok) setPw((await res.json()) as PasswordInfo);
    } catch {
      /* the strip still shows what is on air */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upcoming: Occurrence[] = expandOccurrences(shows, broadcasts.filter((b) => b.onRadio), now, new Date(now.getTime() + 8 * 86400000), false);
  const current = upcoming.find((o) => o.start <= now && o.end > now) ?? null;
  const next = upcoming.find((o) => o.start > now) ?? null;

  const rotate = async () => {
    if (!(await confirmDialog("Rotate the broadcast password now? The current source password will stop working."))) return;
    setRotating(true);
    try {
      const res = await fetch("/api/admin/radio/password", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        toast(data.error || "Rotation failed");
        return;
      }
      setPw(data as PasswordInfo);
      setRevealed(true);
    } finally {
      setRotating(false);
    }
  };

  const copy = () => {
    if (!pw?.password) return;
    navigator.clipboard.writeText(pw.password).then(() => toast("Password copied"), () => {});
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-[#16110a] p-5 text-[#fff8e6] dark:bg-black lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        {current ? (
          <>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> On air
            </div>
            <div className="mt-1 truncate text-xl font-extrabold">{current.title}</div>
            <div className="text-sm text-[#fff8e6]/70">until {fmtTime(current.end)}{next ? ` · next: ${next.title}, ${fmtTime(next.start)}` : ""}</div>
          </>
        ) : (
          <>
            <div className="text-xs font-bold uppercase tracking-widest text-[#fff8e6]/60">Nothing on air</div>
            <div className="mt-1 truncate text-xl font-extrabold">{next ? `Next: ${next.title}` : "No radio shows scheduled"}</div>
            {next && <div className="text-sm text-[#fff8e6]/70">{next.start.toLocaleDateString(undefined, { weekday: "long" })} at {fmtTime(next.start)}</div>}
          </>
        )}
      </div>

      <div className="min-w-0 lg:text-right">
        <div className="text-xs font-bold uppercase tracking-widest text-[#fff8e6]/60">Broadcast password</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 lg:justify-end">
          <span className="min-w-[10rem] truncate rounded-full bg-[#fff8e6]/10 px-4 py-2 font-mono text-sm">
            {pw?.password ? (revealed ? pw.password : "••••••••••••••••") : "none recorded yet"}
          </span>
          {pw?.password && (
            <>
              <button type="button" onClick={() => setRevealed((v) => !v)} aria-label="Show or hide password" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#fff8e6]/10 hover:bg-[#fff8e6]/20">
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button type="button" onClick={copy} aria-label="Copy password" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#fff8e6]/10 hover:bg-[#fff8e6]/20">
                <Copy className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={rotate}
            disabled={rotating || !pw?.rotationConfigured}
            title={pw && !pw.rotationConfigured ? "Set the rotation endpoint in Settings, Radio" : undefined}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-bold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Rotate
          </button>
        </div>
        <div className="mt-1.5 text-xs text-[#fff8e6]/60">
          {pw?.lastRotatedAt ? `Rotated ${new Date(pw.lastRotatedAt).toLocaleString()}. ` : "Never rotated from this site. "}
          {pw && pw.rotationFrequencyHours > 0 ? `Auto every ${pw.rotationFrequencyHours}h. ` : "Auto-rotation off. "}
          <Link href="/admin/settings/radio" className="underline">Rotation settings</Link>
        </div>
      </div>
    </div>
  );
}
