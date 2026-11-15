"use client";
import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDialog, toast } from "@/components/gs/dialogs";
import { api, duration, FINAL, type Import, type Review } from "./types";

const STATE_LABEL: Record<string, string> = {
  queued: "Waiting",
  expanding: "Reading the list",
  running: "Downloading",
  done: "Finished",
  failed: "Failed",
  cancelled: "Stopped",
};

/** Paste a link; follow the downloads. */
export function AddSongs({ imports, onChange }: { imports: Import[]; onChange: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      const link = url.trim();
      // Spotify only lets the downloader read a playlist's first 100 songs: ask before importing a bigger one.
      const check = await api<{ songCount: number | null; limit: number | null }>(`/api/admin/radio/imports/check?url=${encodeURIComponent(link)}`);
      if (check.limit && (check.songCount == null || check.songCount > check.limit)) {
        const ok = await confirmDialog(
          check.songCount
            ? `This playlist has ${check.songCount} songs, but Spotify only shows the first ${check.limit}, so only those will be imported. For the whole playlist, import a YouTube Music copy of it instead. Import the first ${check.limit}?`
            : `Spotify only shows the first ${check.limit} songs of a playlist, so if this one has more, only those will be imported. For a bigger playlist, import a YouTube Music copy of it instead. Continue?`
        );
        if (!ok) return;
      }
      await api("/api/admin/radio/imports", { method: "POST", body: JSON.stringify({ url: link }) });
      setUrl("");
      onChange();
    } catch (err: any) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const stop = async (id: string) => {
    try {
      await api(`/api/admin/radio/imports/${id}`, { method: "DELETE" });
      onChange();
    } catch (err: any) {
      toast(err.message);
    }
  };

  const running = imports.filter((i) => !FINAL.includes(i.state));
  const recent = imports.filter((i) => FINAL.includes(i.state));
  const shown = [...running, ...(showAll ? recent : recent.slice(0, 3))];

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="radio-import-url" className="sr-only">Song or playlist link</label>
        <Input
          id="radio-import-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube, YouTube Music, SoundCloud or Spotify link"
          className="h-11 flex-1"
          autoComplete="off"
        />
        <Button type="submit" disabled={busy || !url.trim()} className="h-11 cursor-pointer px-6">
          {busy ? "Adding…" : "Add"}
        </Button>
      </form>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        A song, an album or a playlist. Albums and playlists also become a playlist here, linked to the original so you can re-sync it later.
      </p>

      {shown.length > 0 && (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {shown.map((i) => {
            const total = i.total || 0;
            const pct = total ? Math.round(((i.done + i.failed) / total) * 100) : 0;
            const live = !FINAL.includes(i.state);
            return (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{i.position != null ? `${i.title || i.url}${i.playlistName ? ` (for ${i.playlistName})` : ""}` : i.playlistName && i.playlistName !== i.url ? i.playlistName : i.title || i.url}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {STATE_LABEL[i.state] || i.state}
                    {total > 0 && ` · ${i.done} of ${total} added`}
                    {i.sourceTotal && i.sourceTotal > total ? ` (first ${total} of ${i.sourceTotal}, Spotify's limit: import a YouTube Music copy for the rest)` : ""}
                    {i.failed > 0 && ` · ${i.failed} failed`}
                    {i.error && ` · ${i.error}`}
                  </div>
                  {live && total > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                {live && (
                  <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => stop(i.id)}>
                    Stop
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {recent.length > 3 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="cursor-pointer text-xs font-bold text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
          {showAll ? "Show fewer" : `Show all ${recent.length} finished imports`}
        </button>
      )}
    </section>
  );
}

/** Spotify tracks with no confident match: pick one of the downloader's candidates, or skip. */
export function ReviewMatches({ reviews, onChange }: { reviews: Review[]; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!reviews.length) return null;

  const answer = async (r: Review, url: string | null) => {
    setBusy(`${r.importId}:${r.index}`);
    try {
      await api(`/api/admin/radio/imports/${r.importId}/review`, { method: "POST", body: JSON.stringify({ index: r.index, url }) });
      onChange();
    } catch (err: any) {
      toast(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold">Pick the right version</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {reviews.length} Spotify {reviews.length === 1 ? "track has" : "tracks have"} no sure match on YouTube Music. Open a candidate to check it, then pick one or skip the track.
        </p>
      </div>
      <ul className="space-y-3">
        {reviews.map((r) => {
          const key = `${r.importId}:${r.index}`;
          return (
            <li key={key} className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold">{r.spotify?.title || "Unknown track"}</div>
                  <div className="text-sm text-neutral-500 dark:text-neutral-400">
                    {r.spotify?.artists.join(", ")}
                    {r.spotify?.durationMs ? ` · ${duration(r.spotify.durationMs / 1000)}` : ""}
                    {r.playlistName ? ` · in ${r.playlistName}` : ""}
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="cursor-pointer" disabled={busy === key} onClick={() => answer(r, null)}>
                  Skip this track
                </Button>
              </div>
              {r.candidates.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-500">No candidates found. Paste the right link above to add it by hand.</p>
              ) : (
                <ul className="mt-3 grid gap-2 md:grid-cols-3">
                  {r.candidates.map((c) => (
                    <li key={c.url} className="flex flex-col justify-between gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                      <div className="min-w-0">
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-1 text-sm font-bold hover:underline">
                          <span className="line-clamp-2">{c.title}</span>
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-60" aria-hidden />
                        </a>
                        <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                          {[c.artists?.join(", "), duration(c.durationSec), c.kind].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="cursor-pointer self-start" disabled={busy === key} onClick={() => answer(r, c.url)}>
                        Use this one
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
