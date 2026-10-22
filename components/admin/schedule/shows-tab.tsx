"use client";
import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Loader2, Upload } from "lucide-react";
import type { ShowRecord } from "@/lib/schedule-client";
import { labelClass } from "./styles";

async function uploadArt(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", "radio");
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
  return data.url as string;
}

export function ShowsTab({ shows, loading, reload }: { shows: ShowRecord[]; loading: boolean; reload: () => Promise<void> }) {
  const [newName, setNewName] = useState("");
  const [newPresenter, setNewPresenter] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newArtUrl, setNewArtUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const load = reload;

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

  const handleDeleteShow = async (show: ShowRecord) => {
    if (!confirm(`Delete "${show.name}"? Its radio airings are removed from the schedule; livestreams keep their entry.`)) return;
    const res = await fetch(`/api/admin/radio/shows/${show.id}`, { method: "DELETE" });
    if (res.ok) await load();
    else alert(((await res.json().catch(() => ({}))) as any).error || "Failed to delete show");
  };

  const handleReplaceArt = async (show: ShowRecord, file: File | undefined) => {
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

  return (
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
                No shows yet. Create one, then schedule it from the Schedule tab.
              </Card>
            ) : (
              shows.map((show) => {
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

                  </Card>
                );
              })
            )}
          </div>
        </div>
  );
}
