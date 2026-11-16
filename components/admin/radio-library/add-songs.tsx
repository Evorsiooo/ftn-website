"use client";
import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
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
    <div style={{ display: "grid", gap: 16 }}>
      <form onSubmit={submit} style={{ display: "grid", gap: 6 }}>
        <label htmlFor="radio-import-url" className="lbl">
          Song, album or playlist link
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="radio-import-url"
            className="input"
            style={{ flex: 1 }}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="YouTube, YouTube Music, SoundCloud or Spotify"
            autoComplete="off"
            autoFocus
          />
          <button type="submit" className="btn primary" disabled={busy || !url.trim()}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        <div className="help">Albums and playlists also become a playlist here, linked to the original so you can re-sync it later.</div>
      </form>

      {shown.length > 0 && (
        <section className="todo">
          <h2>Imports</h2>
          <div className="rows">
            {shown.map((i) => {
              const total = i.total || 0;
              const pct = total ? Math.round(((i.done + i.failed) / total) * 100) : 0;
              const live = !FINAL.includes(i.state);
              return (
                <div key={i.id} className="r">
                  <div className="grow">
                    <div className="trunc" style={{ fontWeight: 600 }}>
                      {i.position != null ? `${i.title || i.url}${i.playlistName ? ` (for ${i.playlistName})` : ""}` : i.playlistName && i.playlistName !== i.url ? i.playlistName : i.title || i.url}
                    </div>
                    <div className="t12 muted">
                      {STATE_LABEL[i.state] || i.state}
                      {total > 0 && ` · ${i.done} of ${total} added`}
                      {i.sourceTotal && i.sourceTotal > total ? ` (first ${total} of ${i.sourceTotal}, Spotify's limit: import a YouTube Music copy for the rest)` : ""}
                      {i.failed > 0 && ` · ${i.failed} failed`}
                      {i.error && ` · ${i.error}`}
                    </div>
                    {live && total > 0 && (
                      <div className="meter" style={{ marginTop: 6 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <i style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  {live && (
                    <button type="button" className="btn sm" onClick={() => stop(i.id)}>
                      Stop
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {recent.length > 3 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="btn sm ghost" style={{ marginTop: 6 }}>
              {showAll ? "Show fewer" : `Show all ${recent.length} finished imports`}
            </button>
          )}
        </section>
      )}
    </div>
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
    <div style={{ display: "grid", gap: 16 }}>
      <p className="muted" style={{ margin: 0 }}>
        {reviews.length} Spotify {reviews.length === 1 ? "track has" : "tracks have"} no sure match on YouTube Music. Open a candidate to check it, then pick one or skip the track.
      </p>
      {reviews.map((r) => {
        const key = `${r.importId}:${r.index}`;
        return (
          <section key={key} className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
            <div className="line">
              <div>
                <div style={{ fontWeight: 600 }}>{r.spotify?.title || "Unknown track"}</div>
                <div className="t12 muted">
                  {r.spotify?.artists.join(", ")}
                  {r.spotify?.durationMs ? ` · ${duration(r.spotify.durationMs / 1000)}` : ""}
                  {r.playlistName ? ` · in ${r.playlistName}` : ""}
                </div>
              </div>
              <button type="button" className="btn sm ghost" disabled={busy === key} onClick={() => answer(r, null)}>
                Skip
              </button>
            </div>
            {r.candidates.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No candidates found. Add the right link by hand with Add songs.</p>
            ) : (
              <div className="rows">
                {r.candidates.map((c) => (
                  <div key={c.url} className="r">
                    <div className="grow">
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="link" style={{ display: "inline-flex", gap: 4, alignItems: "center", maxWidth: "100%" }}>
                        <span className="trunc">{c.title}</span>
                        <ExternalLink className="ic-sm" aria-hidden />
                      </a>
                      <div className="t12 muted">{[c.artists?.join(", "), duration(c.durationSec), c.kind].filter(Boolean).join(" · ")}</div>
                    </div>
                    <button type="button" className="btn sm strong" disabled={busy === key} onClick={() => answer(r, c.url)}>
                      Use this
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
