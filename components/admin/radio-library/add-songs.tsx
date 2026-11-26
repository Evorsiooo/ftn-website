"use client";
import React, { useEffect, useState } from "react";
import { Check, ExternalLink, Search } from "lucide-react";
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

/** A YouTube Music search result (/api/admin/radio/search). */
export type MusicResult = { videoId: string; title: string; artist: string; album: string | null; durationSec: number | null; thumbnail: string | null; explicit: boolean; url: string };

/** Words, not a link: search YouTube Music as you type. */
export const looksLikeLink = (text: string) => /^(https?:\/\/|www\.)|\b(youtu\.?be|spotify|soundcloud)\b[^\s]*\//i.test(text.trim());

/**
 * Live YouTube Music search: 400 ms after the last key, from 3 characters, newest answer wins.
 * The VPS does the search (the browser can't reach YouTube Music).
 */
export function useMusicSearch(text: string, enabled = true) {
  const [results, setResults] = useState<MusicResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const q = text.trim();
    if (!enabled || q.length < 3 || looksLikeLink(q)) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      api<{ songs: MusicResult[] }>(`/api/admin/radio/search?q=${encodeURIComponent(q)}`)
        .then((d) => live && (setResults(d.songs), setError(null)))
        .catch((err) => live && (setResults(null), setError(err.message)))
        .finally(() => live && setLoading(false));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text, enabled]);
  return { results, loading, error };
}

/** Paste a link, or search YouTube Music; follow the downloads. */
export function AddSongs({ imports, onChange }: { imports: Import[]; onChange: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // the songs always go into your collection; on the AutoDJ too when ticked
  const [autodj, setAutodj] = useState(true);
  const search = useMusicSearch(url);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const isLink = looksLikeLink(url);

  const addResult = async (r: MusicResult) => {
    setAdding(r.videoId);
    try {
      await api("/api/admin/radio/imports", { method: "POST", body: JSON.stringify({ url: r.url, autodj }) });
      setAdded((prev) => new Set(prev).add(r.videoId));
      onChange();
    } catch (err: any) {
      toast(err.message);
    } finally {
      setAdding(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !looksLikeLink(url)) return;
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
      await api("/api/admin/radio/imports", { method: "POST", body: JSON.stringify({ url: link, autodj }) });
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
          Search for a song, or paste a link
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="search" style={{ flex: 1 }}>
            <Search />
            <input
              id="radio-import-url"
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Artist and title, or a YouTube, SoundCloud or Spotify link"
              autoComplete="off"
              autoFocus
            />
          </div>
          {isLink && (
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Adding…" : "Add"}
            </button>
          )}
        </div>
        <div className="help">Songs are found on YouTube Music. Album and playlist links also become a playlist here, linked to the original so you can re-sync it later.</div>
      </form>
      {!isLink && url.trim().length >= 3 && (
        <MusicResults
          results={search.results}
          loading={search.loading}
          error={search.error}
          action={(r) =>
            added.has(r.videoId) ? (
              <span className="btn sm ghost" aria-disabled>
                <Check className="ic-sm" aria-hidden /> Added
              </span>
            ) : (
              <button type="button" className="btn sm strong" disabled={adding === r.videoId} onClick={() => addResult(r)}>
                {adding === r.videoId ? "Adding…" : "Add"}
              </button>
            )
          }
        />
      )}
      <label className="chk">
        <input type="checkbox" className="check" checked={autodj} onChange={(e) => setAutodj(e.target.checked)} />
        Also add to the AutoDJ
      </label>

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
                      {i.collectionOf && i.mine && (i.autodj === false ? " · Your collection" : " · Your collection and the AutoDJ")}
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

/** Search results as rows: cover, title, artist · album · length, and the caller's button. */
export function MusicResults({
  results,
  loading,
  error,
  action,
  compact = false,
}: {
  results: MusicResult[] | null;
  loading: boolean;
  error: string | null;
  action: (r: MusicResult) => React.ReactNode;
  compact?: boolean;
}) {
  if (error) return <p className="muted" style={{ margin: compact ? "8px" : 0 }}>{error}</p>;
  if (!results) return <p className="muted" style={{ margin: compact ? "8px" : 0 }}>{loading ? "Searching YouTube Music…" : ""}</p>;
  if (!results.length) return <p className="muted" style={{ margin: compact ? "8px" : 0 }}>No songs found on YouTube Music.</p>;
  return (
    <div className={compact ? undefined : "rows"} style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
      {results.map((r) => (
        <div key={r.videoId} className={compact ? "song" : "r"}>
          {r.thumbnail ? (
            <img className="cover" src={r.thumbnail} alt="" loading="lazy" width={40} height={40} style={compact ? undefined : { width: 40, height: 40, borderRadius: 6, objectFit: "cover", flex: "none" }} />
          ) : (
            <span className="cover" style={compact ? undefined : { width: 40, height: 40, borderRadius: 6, background: "var(--a-hover)", flex: "none" }} />
          )}
          {compact ? (
            <span className="trunc" style={{ flex: 1 }}>
              {r.title} <span className="muted">· {r.artist}</span>
            </span>
          ) : (
            <div className="grow">
              <div className="trunc" style={{ fontWeight: 600 }}>
                {r.title}
                {r.explicit && <span className="muted t12"> · E</span>}
              </div>
              <div className="t12 muted trunc">{[r.artist, r.album].filter(Boolean).join(" · ")}</div>
            </div>
          )}
          <span className="t12 muted num dur">{duration(r.durationSec)}</span>
          {action(r)}
        </div>
      ))}
    </div>
  );
}
