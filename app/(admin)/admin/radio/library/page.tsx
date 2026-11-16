"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal, Plus, RefreshCw, Search, Upload } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { Body, PageBar, Screen, Seg, Sheet } from "@/components/admin/ui";
import { SongRatings } from "@/components/admin/radio-library/ratings";
import { canManageRadio } from "@/lib/rbac";
import { AddSongs, ReviewMatches } from "@/components/admin/radio-library/add-songs";
import { SongPane, SongTable, UploadSong, usePreview } from "@/components/admin/radio-library/songs";
import { PlaylistList } from "@/components/admin/radio-library/playlists";
import { useMetadataCheck } from "@/components/admin/radio-library/metadata-check";
import { api, FINAL, type Import, type Playlist, type Review, type Song } from "@/components/admin/radio-library/types";
import { refreshAdminSummary } from "@/lib/admin-summary";
import { cn } from "@/lib/utils";

type Tab = "songs" | "playlists" | "ratings";

function LibraryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = ((["songs", "playlists", "ratings"] as const).find((t) => t === params.get("tab")) ?? "songs") as Tab;
  const setTab = (t: Tab) => router.replace(t === "songs" ? "/admin/radio/library" : `/admin/radio/library?tab=${t}`, { scroll: false });

  const [songs, setSongs] = useState<Song[] | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [imports, setImports] = useState<Import[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"add" | "review" | "upload" | null>(null);
  const [menu, setMenu] = useState(false);
  const preview = usePreview();

  const loadLibrary = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api<{ songs: Song[] }>("/api/admin/radio/songs"), api<{ playlists: Playlist[] }>("/api/admin/radio/playlists")]);
      setSongs(s.songs);
      setPlaylists(p.playlists);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // Imports: the GET also brings unfinished ones up to date with the downloader.
  const doneCount = useRef<string>("");
  const loadImports = useCallback(async () => {
    try {
      const d = await api<{ imports: Import[]; reviews: Review[] }>("/api/admin/radio/imports");
      setImports(d.imports);
      setReviews(d.reviews);
      const sig = d.imports.map((i) => `${i.id}:${i.done}:${i.state}`).join("|");
      if (doneCount.current && sig !== doneCount.current) loadLibrary();
      doneCount.current = sig;
    } catch {
      // the downloader can be down; the library still works
    }
  }, [loadLibrary]);

  const reload = useCallback(() => {
    loadLibrary();
    loadImports();
    refreshAdminSummary();
  }, [loadLibrary, loadImports]);

  useEffect(() => {
    reload();
  }, [reload]);

  const running = imports.filter((i) => !FINAL.includes(i.state));
  useEffect(() => {
    if (!running.length) return;
    const t = setInterval(loadImports, 4000);
    return () => clearInterval(t);
  }, [running.length, loadImports]);

  const meta = useMetadataCheck(songs, loadLibrary);

  const live = useMemo(() => (songs || []).filter((s) => !s.archived), [songs]);
  const archivedSongs = useMemo(() => (songs || []).filter((s) => s.archived), [songs]);
  const shown = useMemo(() => {
    const list = archived ? archivedSongs : live;
    const q = query.trim().toLowerCase();
    return q ? list.filter((s) => `${s.title} ${s.artist} ${s.album || ""}`.toLowerCase().includes(q)) : list;
  }, [archived, live, archivedSongs, query]);
  const current = (songs || []).find((s) => s.id === selected) ?? null;

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  const tabs = [
    { value: "songs" as const, label: "Songs", n: songs ? live.length : undefined },
    { value: "playlists" as const, label: "Playlists", n: playlists.length },
    { value: "ratings" as const, label: "Ratings" },
  ];
  const songTools = tab === "songs" && (
    <>
      <div className="search" style={{ width: 240 }}>
        <Search />
        <input className="input sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, artist or album" aria-label="Search songs" />
      </div>
      <label className="t12 muted" style={{ display: "inline-flex", gap: 6, alignItems: "center", whiteSpace: "nowrap", cursor: "pointer" }}>
        <input
          type="checkbox"
          className="check"
          checked={archived}
          onChange={(e) => {
            setArchived(e.target.checked);
            setSelected(null);
          }}
        />
        Archived ({archivedSongs.length})
      </label>
    </>
  );

  const checking = meta.state.running || meta.state.note || (meta.state.all && meta.state.total > 0);

  return (
    <Screen>
      <PageBar
        title="Song library"
        tools={
          <>
            <Seg value={tab} onChange={setTab} options={tabs} label="Show" />
            {songTools}
          </>
        }
        end={
          <>
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="btn icon"
                aria-label="More"
                aria-expanded={menu}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu((v) => !v);
                }}
              >
                <MoreHorizontal className="ic" />
              </button>
              {menu && (
                <div className="card" role="menu" style={{ position: "absolute", right: 0, top: 40, zIndex: 20, padding: 4, minWidth: 220, boxShadow: "var(--a-shadow)" }}>
                  <button type="button" role="menuitem" className="btn ghost" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => setSheet("upload")}>
                    <Upload className="ic" /> Upload a file
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="btn ghost"
                    style={{ width: "100%", justifyContent: "flex-start" }}
                    disabled={!songs?.length || meta.state.running}
                    onClick={meta.recheckAll}
                    title="Look every song up in the music catalog for its exact title, artist, album and cover"
                  >
                    <RefreshCw className="ic" /> Re-check all titles
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="btn primary has-lbl-m" onClick={() => setSheet("add")} aria-label="Add songs">
              <Plus className="ic" />
              <span className="lbl-m">Add songs</span>
            </button>
          </>
        }
        mrow={
          <>
            <Seg value={tab} onChange={setTab} options={tabs} label="Show" />
          </>
        }
      />
      {tab === "songs" && (
        <div className="adm-mrow">
          <div className="search">
            <Search />
            <input className="input sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs" aria-label="Search songs" />
          </div>
          <label className="t12 muted" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" className="check" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            Archived
          </label>
        </div>
      )}
      {(running.length > 0 || reviews.length > 0) && (
        <div className="notice">
          <span className={running.length ? "dot amber" : "dot grey"} />
          <span className="trunc" style={{ flex: 1 }}>
            {running.length > 0 && (
              <>
                Importing {running.length === 1 ? `“${running[0].playlistName || running[0].title || "a link"}”` : `${running.length} links`}
                {running.length === 1 && running[0].total ? ` · ${running[0].done} of ${running[0].total}` : ""}
                {reviews.length ? " · " : ""}
              </>
            )}
            {reviews.length > 0 && `${reviews.length} ${reviews.length === 1 ? "song needs" : "songs need"} you to pick the right version`}
          </span>
          {reviews.length > 0 && (
            <button type="button" className="btn sm strong" onClick={() => setSheet("review")}>
              Review {reviews.length}
            </button>
          )}
          {running.length > 0 && (
            <button type="button" className="btn sm ghost" onClick={() => setSheet("add")}>
              See imports
            </button>
          )}
        </div>
      )}
      {checking && (
        <div className="notice" role="status">
          <RefreshCw className={cn("ic-sm", meta.state.running && "spin")} />
          <span className="trunc" style={{ flex: 1 }}>
            {meta.state.running ? "Checking titles, artists and covers" : "Checked titles, artists and covers"}: {meta.state.done} of {meta.state.total}
            {meta.state.updated > 0 && `, ${meta.state.updated} updated`}
            {meta.state.note && <span className="muted"> · {meta.state.note}</span>}
          </span>
          {meta.state.running && (
            <button type="button" className="btn sm" onClick={meta.stop}>
              Stop
            </button>
          )}
        </div>
      )}
      <Body scroll={tab === "ratings"}>
        {tab === "ratings" ? (
          <SongRatings />
        ) : error ? (
          <div className="empty">{error}</div>
        ) : !songs ? (
          <div className="pane-empty">Loading the library…</div>
        ) : tab === "playlists" ? (
          <PlaylistList playlists={playlists} imports={imports} library={songs} onChange={reload} preview={preview} />
        ) : songs.length === 0 ? (
          <div className="pane-empty">
            <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
              <b style={{ color: "var(--a-text)" }}>The library is empty.</b>
              <span>Paste a song or playlist link to add the first songs.</span>
              <button type="button" className="btn primary" onClick={() => setSheet("add")}>
                <Plus className="ic" /> Add songs
              </button>
            </div>
          </div>
        ) : (
          <div className={cn("ld side-right", current && "detail")}>
            <div className="ld-list">
              <SongTable songs={shown} selectedId={selected} onSelect={setSelected} archivedView={archived} />
            </div>
            <div className="ld-pane">
              {current ? <SongPane song={current} onChange={loadLibrary} onClose={() => setSelected(null)} preview={preview} /> : <div className="pane-empty">Pick a song to listen to it, edit it or archive it.</div>}
            </div>
          </div>
        )}
      </Body>
      {sheet === "add" && (
        <Sheet title="Add songs" onClose={() => setSheet(null)}>
          <AddSongs imports={imports} onChange={reload} />
        </Sheet>
      )}
      {sheet === "review" && (
        <Sheet title="Pick the right version" onClose={() => setSheet(null)} wide>
          {reviews.length ? <ReviewMatches reviews={reviews} onChange={reload} /> : <div className="empty">All done. Nothing left to review.</div>}
        </Sheet>
      )}
      {sheet === "upload" && <UploadSong onClose={() => setSheet(null)} onDone={loadLibrary} />}
    </Screen>
  );
}

export default function RadioLibraryPage() {
  return (
    <AdminAuthGuard requiredPermission={canManageRadio} featureTitle="Song library">
      <React.Suspense fallback={null}>
        <LibraryPage />
      </React.Suspense>
    </AdminAuthGuard>
  );
}
