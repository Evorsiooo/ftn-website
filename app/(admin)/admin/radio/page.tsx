"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { ArrowLeft, Radio, Trash2, Loader2, Eye, EyeOff, Copy, RefreshCw, Upload, Plus, KeyRound } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { canManageRadio } from "@/lib/rbac";

interface Show {
  id: string;
  name: string;
  presenter: string;
  description: string | null;
  artUrl: string | null;
}

interface Slot {
  id: string;
  showId: string;
  kind: "weekly" | "once";
  tag: "live" | "simulcast" | "rebroadcast";
  dayOfWeek: number | null;
  startMinute: number | null;
  durationMinutes: number | null;
  startsAt: string | null;
  endsAt: string | null;
}

interface PasswordInfo {
  password: string | null;
  lastRotatedAt: number | null;
  rotationFrequencyHours: number;
  rotationTimeUtc: string;
  rotationConfigured: boolean;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const labelClass = "block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1";
const selectClass =
  "w-full h-9 rounded-md border border-neutral-300 bg-neutral-50 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function describeSlot(slot: Slot): string {
  if (slot.kind === "once" && slot.startsAt && slot.endsAt) {
    const s = new Date(slot.startsAt);
    const e = new Date(slot.endsAt);
    return `${s.toISOString().slice(0, 16).replace("T", " ")} → ${e.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }
  const start = slot.startMinute ?? 0;
  const end = (start + (slot.durationMinutes ?? 0)) % (24 * 60);
  const fmt = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  return `${DAYS[slot.dayOfWeek ?? 0]}s ${fmt(start)} – ${fmt(end)} UTC`;
}

async function uploadArt(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", "radio");
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
  return data.url as string;
}

export default function AdminRadioConsole() {
  const [shows, setShows] = useState<Show[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);

  // New show form
  const [newName, setNewName] = useState("");
  const [newPresenter, setNewPresenter] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newArtUrl, setNewArtUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Slot form state, keyed by show id
  const [slotShowId, setSlotShowId] = useState<string | null>(null);
  const [slotKind, setSlotKind] = useState<"weekly" | "once">("weekly");
  const [slotTag, setSlotTag] = useState("live");
  const [slotDay, setSlotDay] = useState(1);
  const [slotStart, setSlotStart] = useState("12:00");
  const [slotDuration, setSlotDuration] = useState(120);
  const [slotFrom, setSlotFrom] = useState("");
  const [slotTo, setSlotTo] = useState("");

  // Broadcast password
  const [pw, setPw] = useState<PasswordInfo | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/radio/shows");
      if (res.ok) {
        const data = (await res.json()) as any;
        setShows(data.shows || []);
        setSlots(data.slots || []);
      }
    } catch (err) {
      console.error("Failed to load radio shows:", err);
    } finally {
      setLoading(false);
    }
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

  const handleArtPicked = async (file: File | undefined, apply: (url: string) => void) => {
    if (!file) return;
    setUploading(true);
    try {
      apply(await uploadArt(file));
    } catch (err: any) {
      alert(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleAddShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPresenter.trim()) {
      alert("Show name and presenter are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/radio/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          presenter: newPresenter,
          description: newDescription,
          artUrl: newArtUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        alert(data.error || "Failed to create show");
        return;
      }
      setNewName("");
      setNewPresenter("");
      setNewDescription("");
      setNewArtUrl(null);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteShow = async (show: Show) => {
    if (!confirm(`Delete "${show.name}" and all of its slots?`)) return;
    const res = await fetch(`/api/admin/radio/shows/${show.id}`, { method: "DELETE" });
    if (res.ok) await load();
    else alert(((await res.json().catch(() => ({}))) as any).error || "Failed to delete show");
  };

  const handleReplaceArt = async (show: Show, file: File | undefined) => {
    await handleArtPicked(file, async (url) => {
      const res = await fetch(`/api/admin/radio/shows/${show.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artUrl: url }),
      });
      if (res.ok) await load();
      else alert(((await res.json().catch(() => ({}))) as any).error || "Failed to update art");
    });
  };

  const handleAddSlot = async (e: React.FormEvent, showId: string) => {
    e.preventDefault();
    const body =
      slotKind === "weekly"
        ? { kind: "weekly", tag: slotTag, dayOfWeek: slotDay, startTime: slotStart, durationMinutes: slotDuration }
        : {
            kind: "once",
            tag: slotTag,
            startsAt: slotFrom ? `${slotFrom}:00Z` : "",
            endsAt: slotTo ? `${slotTo}:00Z` : "",
          };
    const res = await fetch(`/api/admin/radio/shows/${showId}/slots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      alert(data.error || "Failed to add slot");
      return;
    }
    setSlotShowId(null);
    await load();
  };

  const handleDeleteSlot = async (slot: Slot) => {
    if (!confirm("Remove this slot?")) return;
    const res = await fetch(`/api/admin/radio/slots/${slot.id}`, { method: "DELETE" });
    if (res.ok) await load();
    else alert("Failed to remove slot");
  };

  const handleRotate = async () => {
    if (!confirm("Rotate the broadcast password now? The current source password will stop working.")) return;
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
    <AdminAuthGuard requiredPermission={canManageRadio} featureTitle="Webradio Broadcast Console">
      <div className="container mx-auto max-w-7xl px-4 sm:px-8 pt-24 sm:pt-28 pb-12 space-y-8 text-neutral-900 dark:text-white">
        <div className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white transition mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
          </Link>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-900 dark:text-white flex items-center gap-2.5">
            <Radio className="h-7 w-7 text-blue-600 dark:text-blue-400" /> Webradio
          </h1>
        </div>

        {/* Broadcast password */}
        <Card className="p-6 space-y-4 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-bold">Broadcast Password</h2>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add show */}
          <Card className="p-6 space-y-4 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none h-fit">
            <h2 className="text-lg font-bold">Create Show</h2>
            <form onSubmit={handleAddShow} className="space-y-3">
              <div>
                <label className={labelClass}>Show Name</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Friday Night Pulse" />
              </div>
              <div>
                <label className={labelClass}>Presenter / DJ</label>
                <Input value={newPresenter} onChange={(e) => setNewPresenter(e.target.value)} placeholder="DJ Nova" />
              </div>
              <div>
                <label className={labelClass}>Description (optional)</label>
                <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Album Art</label>
                <div className="flex items-center gap-3">
                  {newArtUrl ? (
                    <img src={newArtUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded-md bg-neutral-200 dark:bg-neutral-800" />
                  )}
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-2">
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Upload
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => handleArtPicked(e.target.files?.[0], setNewArtUrl)}
                    />
                  </label>
                </div>
              </div>
              <Button type="submit" disabled={submitting || uploading} className="w-full text-xs font-bold cursor-pointer">
                {submitting ? "Creating..." : "Create Show"}
              </Button>
            </form>
          </Card>

          {/* Shows and slots */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-bold">Shows</h2>
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading shows...
              </div>
            ) : shows.length === 0 ? (
              <Card className="p-6 text-xs text-neutral-500 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                No shows yet. Create one to start scheduling.
              </Card>
            ) : (
              shows.map((show) => {
                const showSlots = slots.filter((s) => s.showId === show.id);
                return (
                  <Card key={show.id} className="p-5 space-y-4 border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-none">
                    <div className="flex items-start gap-4">
                      {show.artUrl ? (
                        <img src={show.artUrl} alt="" className="h-16 w-16 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-neutral-200 dark:bg-neutral-800 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-base truncate">{show.name}</div>
                        <div className="text-xs text-neutral-600 dark:text-neutral-400">{show.presenter}</div>
                        {show.description && <div className="text-xs text-neutral-500 mt-1">{show.description}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-semibold cursor-pointer underline text-neutral-600 dark:text-neutral-400">
                          Replace art
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            onChange={(e) => handleReplaceArt(show, e.target.files?.[0])}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleDeleteShow(show)}
                          className="text-red-600 hover:text-red-500 cursor-pointer"
                          aria-label={`Delete ${show.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {showSlots.length === 0 && <div className="text-xs text-neutral-500">No slots — this show never airs.</div>}
                      {showSlots.map((slot) => (
                        <div key={slot.id} className="flex items-center justify-between text-xs rounded-md bg-neutral-100 dark:bg-neutral-900 px-3 py-2">
                          <span className="font-mono">
                            {describeSlot(slot)}
                            {slot.kind === "once" && " (one-off)"}
                            {slot.tag !== "live" && ` · ${slot.tag}`}
                          </span>
                          <button type="button" onClick={() => handleDeleteSlot(slot)} className="text-red-600 cursor-pointer" aria-label="Remove slot">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {slotShowId === show.id ? (
                      <form onSubmit={(e) => handleAddSlot(e, show.id)} className="space-y-3 border-t border-neutral-200 dark:border-neutral-800 pt-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelClass}>Type</label>
                            <select value={slotKind} onChange={(e) => setSlotKind(e.target.value as any)} className={selectClass}>
                              <option value="weekly">Weekly (repeats)</option>
                              <option value="once">One-off</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelClass}>Broadcast</label>
                            <select value={slotTag} onChange={(e) => setSlotTag(e.target.value)} className={selectClass}>
                              <option value="live">Live</option>
                              <option value="simulcast">Simulcast</option>
                              <option value="rebroadcast">Rebroadcast</option>
                            </select>
                          </div>
                        </div>
                        {slotKind === "weekly" ? (
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className={labelClass}>Day (UTC)</label>
                              <select value={slotDay} onChange={(e) => setSlotDay(Number(e.target.value))} className={selectClass}>
                                {DAYS.map((d, i) => (
                                  <option key={d} value={i}>
                                    {d}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className={labelClass}>Start (UTC)</label>
                              <input type="time" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} className={selectClass} />
                            </div>
                            <div>
                              <label className={labelClass}>Minutes</label>
                              <input
                                type="number"
                                min={5}
                                max={1440}
                                value={slotDuration}
                                onChange={(e) => setSlotDuration(Number(e.target.value))}
                                className={selectClass}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={labelClass}>Starts (UTC)</label>
                              <input type="datetime-local" value={slotFrom} onChange={(e) => setSlotFrom(e.target.value)} className={selectClass} />
                            </div>
                            <div>
                              <label className={labelClass}>Ends (UTC)</label>
                              <input type="datetime-local" value={slotTo} onChange={(e) => setSlotTo(e.target.value)} className={selectClass} />
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" className="text-xs cursor-pointer">
                            Add slot
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setSlotShowId(null)} className="text-xs cursor-pointer">
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => setSlotShowId(show.id)} className="text-xs gap-1.5 cursor-pointer">
                        <Plus className="h-3.5 w-3.5" /> Add slot
                      </Button>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>
    </AdminAuthGuard>
  );
}
