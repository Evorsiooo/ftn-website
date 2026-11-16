"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Copy, RefreshCw, Loader2, X } from "lucide-react";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import { Button } from "@/components/ui/button";
import { RadioSetupWizard } from "./radio-setup-wizard";

interface PasswordInfo {
  password: string | null;
  lastRotatedAt: number | null;
  rotationFrequencyHours: number;
  rotationTimeUtc: string;
  rotationConfigured: boolean;
}

/**
 * Broadcasting from OBS instead of the Studio: the extra way to go on air, for a full studio setup.
 * The source password the DJ needs, and the setup guide.
 */
export function ObsPanel({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState<PasswordInfo | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [guide, setGuide] = useState(false);

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
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Broadcast from OBS"
        className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-card text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-brand px-6 py-5 text-brand-ink">
          <h2 className="text-xl font-extrabold">Broadcast from OBS</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#16110a] text-[#fff8e6] hover:bg-black">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-5 p-6">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            The Studio is the usual way to go on air. OBS is for a full studio setup: it sends its own stream to the radio, which plays it instead of the AutoDJ while it&apos;s connected.
          </p>
      <div className="min-w-0 rounded-2xl bg-[#16110a] p-5 text-[#fff8e6] dark:bg-black">
        <div className="text-xs font-bold uppercase tracking-widest text-[#fff8e6]/60">Broadcast password</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
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
          <Button variant="outline" onClick={() => setGuide(true)} className="h-10 cursor-pointer px-5 text-sm">
            OBS setup guide
          </Button>
        </div>
      </aside>
      {guide && <RadioSetupWizard onClose={() => setGuide(false)} />}
    </div>
  );
}
