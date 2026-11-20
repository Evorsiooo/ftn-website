"use client";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import React, { useState } from "react";
import { Trash2, Loader2, Upload } from "lucide-react";
import type { ShowRecord } from "@/lib/schedule-client";

export async function uploadArt(file: File): Promise<string> {
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
      toast(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleAddShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPresenter.trim()) {
      toast("Show name and presenter are required.");
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
        toast(data.error || "Failed to create show");
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
    if (!(await confirmDialog(`Delete "${show.name}"? Its radio airings are removed from the schedule; livestreams keep their entry.`, { ok: "Delete", danger: true }))) return;
    const res = await fetch(`/api/admin/radio/shows/${show.id}`, { method: "DELETE" });
    if (res.ok) await load();
    else toast(((await res.json().catch(() => ({}))) as any).error || "Failed to delete show");
  };

  const handleReplaceArt = async (show: ShowRecord, file: File | undefined) => {
    await handleArtPicked(file, async (url) => {
      const res = await fetch(`/api/admin/radio/shows/${show.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artUrl: url }),
      });
      if (res.ok) await load();
      else toast(((await res.json().catch(() => ({}))) as any).error || "Failed to update art");
    });
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="todo">
        <h2>
          Shows <span className="c">{shows.length}</span>
        </h2>
        {loading ? (
          <div className="muted">Loading shows…</div>
        ) : shows.length === 0 ? (
          <div className="rows">
            <div className="r muted">No shows yet. Create one below, then add it to the Schedule.</div>
          </div>
        ) : (
          <div className="rows">
            {shows.map((show) => (
              <div key={show.id} className="r">
                {show.artUrl ? <img src={show.artUrl} alt="" className="thumb" style={{ width: 44, height: 44 }} /> : <span className="thumb" style={{ width: 44, height: 44 }} />}
                <div className="grow">
                  <div className="trunc" style={{ fontWeight: 600 }}>
                    {show.name}
                  </div>
                  <div className="t12 muted trunc">
                    {show.presenter}
                    {show.description ? ` · ${show.description}` : ""}
                  </div>
                </div>
                <label className="btn sm ghost">
                  Replace art
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => handleReplaceArt(show, e.target.files?.[0])} />
                </label>
                <button type="button" onClick={() => handleDeleteShow(show)} className="iconbtn" aria-label={`Delete ${show.name}`}>
                  <Trash2 className="ic-sm" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <form onSubmit={handleAddShow} className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div className="section-title">New show</div>
        <div className="two">
          <div className="field">
            <label>Name</label>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Friday Night Pulse" />
          </div>
          <div className="field">
            <label>Presenter or DJ</label>
            <input className="input" value={newPresenter} onChange={(e) => setNewPresenter(e.target.value)} placeholder="DJ Nova" />
          </div>
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <input className="input" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>Cover art</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {newArtUrl ? <img src={newArtUrl} alt="" className="thumb" style={{ width: 44, height: 44 }} /> : <span className="thumb" style={{ width: 44, height: 44 }} />}
            <label className="btn sm">
              {uploading ? <Loader2 className="ic-sm spin" /> : <Upload className="ic-sm" />}
              Upload
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => handleArtPicked(e.target.files?.[0], setNewArtUrl)} />
            </label>
          </div>
        </div>
        <div>
          <button type="submit" disabled={submitting || uploading} className="btn strong">
            {submitting ? "Creating…" : "Create show"}
          </button>
        </div>
      </form>
    </div>
  );
}
