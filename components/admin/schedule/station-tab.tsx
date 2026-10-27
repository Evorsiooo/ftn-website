"use client";
import { confirmDialog } from "@/components/gs/dialogs";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Copy, RefreshCw, KeyRound, Loader2 } from "lucide-react";

interface PasswordInfo {
  password: string | null;
  lastRotatedAt: number | null;
  rotationFrequencyHours: number;
  rotationTimeUtc: string;
  rotationConfigured: boolean;
}

export function StationTab() {
  const [pw, setPw] = useState<PasswordInfo | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/radio/password");
      if (res.ok) setPw((await res.json()) as PasswordInfo);
      else setPwError(((await res.json().catch(() => ({}))) as any).error || "Could not load password");
    } catch {
      setPwError("Could not load password");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRotate = async () => {
    if (!await confirmDialog("Rotate the broadcast password now? The current source password will stop working.")) return;
    setRotating(true);
    setPwError(null);
    try {
      const res = await fetch("/api/admin/radio/password", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        setPwError(data.error || "Rotation failed");
        return;
      }
      setPw(data as PasswordInfo);
      setRevealed(true);
    } finally {
      setRotating(false);
    }
  };

  const copyPassword = () => {
    if (pw?.password) navigator.clipboard.writeText(pw.password).catch(() => {});
  };

  return (
        <Card className="mx-auto max-w-3xl p-6 space-y-4 rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand-text" />
            <h2 className="text-lg font-extrabold">Broadcast password</h2>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            The Icecast source password used by the broadcasting software. Automatic rotation is configured in{" "}
            <Link href="/admin/settings" className="underline">
              Site Settings
            </Link>
            .
          </p>
          {pwError && <div className="text-xs text-red-600 dark:text-red-400">{pwError}</div>}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 flex items-center gap-2 rounded-lg border border-neutral-300 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 px-3 py-2 font-mono text-sm min-h-[2.5rem]">
              <span className="flex-1 truncate">
                {pw?.password ? (revealed ? pw.password : "••••••••••••••••") : "No password recorded yet — rotate to generate one."}
              </span>
              {pw?.password && (
                <>
                  <button type="button" onClick={() => setRevealed((v) => !v)} className="cursor-pointer" aria-label="Show or hide password">
                    {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={copyPassword} className="cursor-pointer" aria-label="Copy password">
                    <Copy className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
            <Button
              type="button"
              onClick={handleRotate}
              disabled={rotating || !pw?.rotationConfigured}
              variant="outline"
              className="text-xs gap-1.5 cursor-pointer"
            >
              {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Rotate now
            </Button>
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {pw?.lastRotatedAt ? `Last rotated ${new Date(pw.lastRotatedAt).toLocaleString()}. ` : "Never rotated from this site. "}
            {pw && pw.rotationFrequencyHours > 0
              ? `Automatic rotation every ${pw.rotationFrequencyHours}h${pw.rotationFrequencyHours > 12 ? ` at ${pw.rotationTimeUtc} UTC` : ""}.`
              : "Automatic rotation is off."}
            {pw && !pw.rotationConfigured && " Rotation endpoint is not configured in Radio settings."}
          </div>
        </Card>
  );
}
