"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { Body, PageBar, Screen, Seg, Sheet } from "@/components/admin/ui";
import { SongRatings } from "@/components/admin/radio-library/ratings";
import { canManageRadio } from "@/lib/rbac";
import { AddSongs, ReviewMatches } from "@/components/admin/radio-library/add-songs";
import { SongPane, SongTable, UploadSong, usePreview } from "@/components/admin/radio-library/songs";
import { PlaylistList } from "@/components/admin/radio-library/playlists";
import { Collections } from "@/components/admin/radio-library/collections";
import { useMetadataCheck } from "@/components/admin/radio-library/metadata-check";
import { GENRE_SECONDS_PER_SONG, genresToFind, useGenreCheck } from "@/components/admin/radio-library/genre-check";
import { songStatus, usePrepareRun, type SongPrepResult } from "@/components/admin/radio-library/prepare-run";
import { countLibrary, isVideoCover, LibraryStatus, type OtherRun, type ShowFilter } from "@/components/admin/radio-library/library-status";
import { confirmDialog, toast } from "@/components/gs/dialogs";
import { api, FINAL, type AlbumAudio, type Import, type Playlist, type Review, type Song } from "@/components/admin/radio-library/types";
import { refreshAdminSummary } from "@/lib/admin-summary";
import { cn } from "@/lib/utils";

const n = (x: number) => x.toLocaleString("en-US");

type Tab = "songs" | "playlists" | "collections" | "ratings";

function LibraryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = ((["songs", "playlists", "collections", "ratings"] as const).find((t) => t === params.get("tab")) ?? "songs") as Tab;
  const setTab = (t: Tab) => router.replace(t === "songs" ? "/admin/radio/library" : `/admin/radio/library?tab=${t}`, { scroll: false });

  const [songs, setSongs] = useState<Song[] | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [imports, setImports] = useState<Import[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [show, setShowState] = useState<ShowFilter>("all");
  const [albumAudio, setAlbumAudio] = useState<AlbumAudio | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  // ?song=<file key> (from a radio problem report): open that song once the list is loaded
  const [linked, setLinked] = useState(false);
  const linkedKey = params.get("song");
  useEffect(() => {
    if (linked || !linkedKey || !songs) return;
    setLinked(true);
    const s = songs.find((x) => x.key === linkedKey);
    if (!s) return;
    if (s.archived) setShowState("archived");
    setSelected(s.id);
  }, [linked, linkedKey, songs]);
    const [sheet, setSheet] = useState<"add" | "review" | "upload" | "status" | null>(null);
  const [menu, setMenu] = useState(false);
  const preview = usePreview();

  // One library load at a time; a call while one runs asks for one more afterwards. (Each load reads
  // every song, so a burst of them used to push the site past its CPU allowance and answer 503.)
  const libraryLoad = useRef<{ running: boolean; again: boolean }>({ running: false, again: false });
  const loadLibrary = useCallback(async () => {
    const l = libraryLoad.current;
    if (l.running) {
      l.again = true;
      return;
    }
    l.running = true;
    try {
      do {
        l.again = false;
        try {
          const [s, p] = await Promise.all([api<{ songs: Song[]; at?: number }>("/api/admin/radio/songs"), api<{ playlists: Playlist[] }>("/api/admin/radio/playlists")]);
          setSongs(s.songs);
          // a 304 answer brings back the copy the browser kept, with the time it was first loaded: still right
          if (s.at) loadedAt.current = s.at;
          setPlaylists(p.playlists);
          setError(null);
        } catch (err: any) {
          setError(err.message);
        }
      } while (l.again);
    } finally {
      l.running = false;
    }
  }, []);
  // During an import: only the songs added or changed since the last load, merged into the list (each full
  // load reads every song, about 4,000 rows once the library has grown).
  const loadedAt = useRef(0);
  const loadChanged = useCallback(async () => {
    if (!loadedAt.current) return loadLibrary();
    try {
      const [s, p] = await Promise.all([
        api<{ songs: Song[]; at: number }>(`/api/admin/radio/songs?since=${loadedAt.current}`),
        api<{ playlists: Playlist[] }>("/api/admin/radio/playlists"),
      ]);
      loadedAt.current = s.at;
      if (s.songs.length) {
        setSongs((list) => {
          if (!list) return list;
          const changed = new Map(s.songs.map((x) => [x.id, x]));
          const kept = list.map((x) => changed.get(x.id) ?? x);
          const known = new Set(list.map((x) => x.id));
          return [...s.songs.filter((x) => !known.has(x.id)), ...kept];
        });
      }
      setPlaylists(p.playlists);
    } catch {
      // the next change tries again
    }
  }, [loadLibrary]);
  const patchSong = useCallback((id: string, patch: Partial<Song>) => setSongs((list) => list && list.map((s) => (s.id === id ? { ...s, ...patch } : s))), []);
  const dropSong = useCallback((id: string) => setSongs((list) => list && list.filter((s) => s.id !== id)), []);

  // Imports: the GET also brings unfinished ones up to date with the downloader. withAudio also asks
  // for the album-audio check's state (left out of the 10 s import poll, which doesn't need it).
  // A changed import reloads the library at most once a minute (each load reads every song), and
  // always when an import finishes.
  const doneCount = useRef<string>("");
  const finished = useRef<string>("");
  const lastLibraryLoad = useRef(0);
  const loadImports = useCallback(async (withAudio = false) => {
    try {
      const d = await api<{ imports: Import[]; reviews: Review[]; albumAudio?: AlbumAudio | null }>(`/api/admin/radio/imports${withAudio ? "?audio=1" : ""}`);
      setImports(d.imports);
      setReviews(d.reviews);
      if (d.albumAudio !== undefined) setAlbumAudio(d.albumAudio);
      const sig = d.imports.map((i) => `${i.id}:${i.done}:${i.state}`).join("|");
      const fin = d.imports.filter((i) => FINAL.includes(i.state)).map((i) => i.id).join("|");
      const changed = doneCount.current && sig !== doneCount.current;
      const justFinished = finished.current && fin !== finished.current;
      if (justFinished || (changed && Date.now() - lastLibraryLoad.current >= 60_000)) {
        lastLibraryLoad.current = Date.now();
        loadChanged();
      }
      doneCount.current = sig;
      finished.current = fin;
    } catch {
      // the downloader can be down; the library still works
    }
  }, [loadChanged]);

  const reload = useCallback(() => {
    lastLibraryLoad.current = Date.now();
    loadLibrary();
    loadImports(true);
    refreshAdminSummary();
  }, [loadLibrary, loadImports]);

  useEffect(() => {
    reload();
  }, [reload]);

  const running = imports.filter((i) => !FINAL.includes(i.state));
  useEffect(() => {
    if (!running.length) return;
    const t = setInterval(() => loadImports(), 10_000);
    return () => clearInterval(t);
  }, [running.length, loadImports]);

  const meta = useMetadataCheck(songs, patchSong);
  const genreRun = useGenreCheck(songs, patchSong);
  const genresLeft = useMemo(() => genresToFind(songs).length, [songs]);
  const findGenres = async () => {
    setMenu(false);
    const mins = Math.max(1, Math.round((genresLeft * GENRE_SECONDS_PER_SONG) / 60));
    const time = mins >= 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ""}` : `${mins} min`;
    if (
      !(await confirmDialog(
        `Look up ${genresLeft === 1 ? "1 song" : `${n(genresLeft)} songs`} in MusicBrainz and Apple's catalogue for genres and the year ${genresLeft === 1 ? "it" : "each"} first came out? It takes about ${time} in this tab (one MusicBrainz request a second, light on your PC). You can stop it any time and it carries on later.`,
        { ok: "Find genres" }
      ))
    )
      return;
    void genreRun.run();
  };

  // Prepare: each finished song is updated in the list here (no reload of the whole library).
  const onSongDone = useCallback(
    (r: SongPrepResult) => {
      const now = new Date().toISOString();
      patchSong(r.songId, {
        ...(r.patch as Partial<Song> | null),
        ...(r.analysed ? { analysedAt: now } : {}),
        ...(r.titleChecked ? { metaCheckedAt: now } : {}),
        ...(r.error ? { prepError: r.error } : {}),
      });
    },
    [patchSong]
  );
  const prep = usePrepareRun(onSongDone);
  // Genres and original years are looked up alongside each Prepare run started here (Adrien, 2026-11-26).
  // Only when a run starts: stopping the lookup doesn't bring it back until the next run.
  const prepRunning = prep.state.phase === "running";
  const startGenres = genreRun.run;
  useEffect(() => {
    if (prepRunning && genresLeft > 0) void startGenres({ apple: false });
  }, [prepRunning]);


  // Prepare runs on any PC (this one's too): read every 30 s while the page is in view, so a phone can follow one
  // and stop it. One small read of the open runs.
  const [runs, setRuns] = useState<OtherRun[]>([]);
  const loadRuns = useCallback(async () => {
    try {
      setRuns((await api<{ runs: OtherRun[] }>("/api/admin/radio/prepare")).runs);
    } catch {}
  }, []);
  useEffect(() => {
    loadRuns();
    const t = setInterval(() => document.visibilityState === "visible" && loadRuns(), 30_000);
    return () => clearInterval(t);
  }, [loadRuns]);
  // a run elsewhere moved on: the songs it finished show as on air at the next light reload (changed songs only)
  const othersDone = runs.filter((r) => r.id !== prep.state.runId).reduce((a, r) => a + r.done + r.failed, 0);
  const lastOthersDone = useRef(othersDone);
  useEffect(() => {
    if (othersDone !== lastOthersDone.current) {
      lastOthersDone.current = othersDone;
      loadChanged();
    }
  }, [othersDone, loadChanged]);

  const [busy, setBusy] = useState(false);
  // how many collections there are (yours only, unless you're a site admin or manager)
  const [collectionCount, setCollectionCount] = useState<number | null>(null);
  useEffect(() => {
    api<{ owners: unknown[] }>("/api/admin/radio/collections?owners=1").then((d) => setCollectionCount(d.owners.length), () => {});
  }, []);
  const prepOp = async (body: Record<string, unknown>, done: (r: any) => void) => {
    setBusy(true);
    try {
      done(await api("/api/admin/radio/prepare", { method: "POST", body: JSON.stringify(body) }));
    } catch (err: any) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  // The Songs tab is the AutoDJ's library: songs only in broadcasters' collections are on the Collections tab
  // (archived ones stay under Archived, where they can be deleted).
  const autodjSongs = useMemo(() => (songs || []).filter((s) => s.autodj !== false || s.archived), [songs]);
  const counts = useMemo(() => countLibrary(autodjSongs), [autodjSongs]);
  const setShow = (f: ShowFilter) => {
    setShowState(f);
    setSelected(null);
    setSheet((s) => (s === "status" ? null : s));
  };

  // The album-audio check (BitChord's resolveAudio on the downloader): its progress, in Library status.
  // While a batch runs, the numbers come from the server's counts (polled once a minute), so the whole
  // library isn't re-read to move them.
  const audio = useMemo(() => {
    const yt = (songs || []).filter((s) => s.source === "youtube");
    const c = albumAudio?.counts;
    const count = (k: NonNullable<Song["audioCheck"]>) => (c ? c[k] ?? 0 : yt.filter((s) => s.audioCheck === k).length);
    const total = c ? Object.values(c).reduce((a, b) => a + b, 0) : yt.length;
    const kept = count("unmatched");
    const checked = count("album") + count("swapped") + kept + count("duplicate") + count("downloading");
    return { total, checked, swapped: count("swapped"), downloading: count("downloading"), duplicates: count("duplicate"), kept };
  }, [songs, albumAudio?.counts]);
  useEffect(() => {
    if (!albumAudio?.running) return;
    const t = setInterval(() => loadImports(true), 60_000);
    return () => clearInterval(t);
  }, [albumAudio?.running, loadImports]);
  // When a check finishes, load the library once to show its results.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !albumAudio?.running) loadLibrary();
    wasRunning.current = !!albumAudio?.running;
  }, [albumAudio?.running, loadLibrary]);
  const albumLine =
    songs && audio.total > 0 && (albumAudio?.running || albumAudio?.refused || audio.downloading > 0)
      ? `${albumAudio?.refused ? "Album versions: paused" : "Swapping music videos for their album versions"}: ${n(audio.checked)} of ${n(audio.total)} checked` +
        (audio.swapped > 0 ? `, ${n(audio.swapped)} swapped` : "") +
        (audio.downloading > 0 ? `, ${n(audio.downloading)} queued` : "") +
        (audio.kept > 0 ? `, ${n(audio.kept)} kept as videos` : "") +
        (audio.duplicates > 0 ? `, ${n(audio.duplicates)} archived as copies` : "") +
        (!albumAudio?.refused && albumAudio?.minutesLeft != null ? ` · ${timeLeft(albumAudio.minutesLeft)}` : "") +
        (albumAudio?.refused ? ` · ${albumAudio.refused}` : "")
      : null;

  const shown = useMemo(() => {
    const list = autodjSongs.filter((s) => {
      const st = songStatus(s);
      switch (show) {
        case "archived":
          return st === "archived";
        case "on-air":
          return st === "on-air";
        case "getting-ready":
          return st === "getting-ready";
        case "missing":
          return st === "missing";
        case "failed":
          return st === "failed";
        case "videos":
          return st !== "archived" && s.audioCheck === "unmatched";
        case "video-covers":
          return st !== "archived" && isVideoCover(s);
        default:
          return st !== "archived";
      }
    });
    const q = query.trim().toLowerCase();
    return q ? list.filter((s) => `${s.title} ${s.artist} ${s.album || ""}`.toLowerCase().includes(q)) : list;
  }, [show, autodjSongs, query]);
  const current = (songs || []).find((s) => s.id === selected) ?? null;

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  const tabs = [
    { value: "songs" as const, label: "Songs", n: songs ? counts.all : undefined },
    { value: "playlists" as const, label: "Playlists", n: playlists.length },
    { value: "collections" as const, label: "Collections", n: collectionCount ?? undefined },
    { value: "ratings" as const, label: "Ratings" },
  ];
  const showOptions: { value: ShowFilter; label: string; n: number; always?: boolean }[] = [
    { value: "all", label: "All songs", n: counts.all, always: true },
    { value: "on-air", label: "On air", n: counts.onAir, always: true },
    { value: "getting-ready", label: "Getting ready", n: counts.gettingReady, always: true },
    { value: "videos", label: "Kept as music videos", n: counts.videos },
    { value: "video-covers", label: "Cover from the video", n: counts.videoCovers },
    { value: "missing", label: "Missing file", n: counts.missing },
    { value: "failed", label: "Couldn't be prepared", n: counts.failed },
    { value: "archived", label: "Archived", n: counts.archived },
  ];
  const showSelect = (
    <select className="select sm ls-select" value={show} onChange={(e) => setShow(e.target.value as ShowFilter)} aria-label="Show">
      {showOptions
        .filter((o) => o.always || o.n > 0 || o.value === show)
        .map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({n(o.n)})
          </option>
        ))}
    </select>
  );
  const songTools = tab === "songs" && (
    <>
      <div className="search" style={{ width: 240 }}>
        <Search />
        <input className="input sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, artist or album" aria-label="Search songs" />
      </div>
      <div style={{ width: 200 }}>{showSelect}</div>
    </>
  );

  const runningHere = prep.state.phase !== "idle";
  const elsewhereRuns = runs.filter((r) => r.id !== prep.state.runId);
  const status = (
    <LibraryStatus
      counts={counts}
      run={prep.state}
      others={elsewhereRuns}
      imports={running}
      reviews={reviews}
      albumAudio={{ line: albumLine }}
      titleCheck={{
        line:
          meta.state.running || meta.state.note || (meta.state.all && meta.state.total > 0)
            ? `${meta.state.running ? "Re-checking titles, artists and covers" : "Re-checked titles, artists and covers"}: ${n(meta.state.done)} of ${n(meta.state.total)}${meta.state.updated > 0 ? `, ${n(meta.state.updated)} updated` : ""}${meta.state.note ? ` · ${meta.state.note}` : ""}`
            : null,
        running: meta.state.running,
        onStop: meta.stop,
      }}
      genreCheck={{
        line:
          genreRun.state.running || genreRun.state.note || genreRun.state.total > 0
            ? `${genreRun.state.running ? "Finding genres and original years" : "Found genres and original years"}: ${n(genreRun.state.done)} of ${n(genreRun.state.total)}${genreRun.state.done ? `, ${n(genreRun.state.found)} with a genre` : ""}${genreRun.state.note ? ` · ${genreRun.state.note}` : ""}`
            : null,
        running: genreRun.state.running,
        onStop: genreRun.stop,
      }}
      busy={busy || !songs}
      onPrepare={() => prep.start(counts.gettingReady)}
      onStop={prep.stop}
      onStopOther={(id) => prepOp({ op: "stop", runId: id }, () => loadRuns())}
      onShow={setShow}
      onReview={() => setSheet("review")}
      onSeeImports={() => setSheet("add")}
      onRedownload={async () => {
        if (!(await confirmDialog(`Download ${counts.missing === 1 ? "the song whose file is missing" : `the ${n(counts.missing)} songs whose files are missing`} again from ${counts.missing === 1 ? "its" : "their"} link?`, { ok: "Re-download" }))) return;
        prepOp({ op: "redownload" }, (r: { started: number }) => {
          toast(r.started ? `Downloading ${r.started === 1 ? "it" : `${n(r.started)} songs`} again. ${r.started === 1 ? "It goes" : "They go"} back to Getting ready.` : "Only songs added from a link can be downloaded again.");
          reload();
        });
      }}
      onRetry={() =>
        prepOp({ op: "retry" }, (r: { songs: number }) => {
          toast(`${n(r.songs)} ${r.songs === 1 ? "song is" : "songs are"} back in Getting ready.`);
          setSongs((list) => list && list.map((s) => (s.prepError === "failed" ? { ...s, prepError: null } : s)));
        })
      }
    />
  );

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
                    Upload a file
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
                    Re-check all titles and covers
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="btn ghost"
                    style={{ width: "100%", justifyContent: "flex-start" }}
                    disabled={!genresLeft || genreRun.state.running}
                    onClick={findGenres}
                    title={genresLeft ? "Detailed genres and the original year from MusicBrainz, a broad genre from Apple" : "Every song has been looked up"}
                  >
                    Find genres and original years
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
          <div style={{ flex: 1, minWidth: 0 }}>{showSelect}</div>
        </div>
      )}
      {songs && songs.length > 0 && (
        <button type="button" className="ls-open" onClick={() => setSheet("status")}>
          <span className={cn("dot", runningHere || elsewhereRuns.length || counts.gettingReady ? "amber" : "green")} />
          <span className="grow">
            {runningHere
              ? `Preparing: ${n(prep.state.done)} of ${n(prep.state.total)}`
              : elsewhereRuns.length
                ? `Preparing on ${elsewhereRuns[0].userName}'s PC`
                : counts.gettingReady
                  ? `${n(counts.gettingReady)} ${counts.gettingReady === 1 ? "song" : "songs"} getting ready`
                  : "Every song is on air"}
          </span>
          <span className="end">Library status</span>
        </button>
      )}
      <Body scroll={tab === "ratings"}>
        {tab === "ratings" ? (
          <SongRatings />
        ) : error ? (
          <div className="empty">{error}</div>
        ) : !songs ? (
          <div className="pane-empty">Loading the library…</div>
        ) : tab === "collections" ? (
          <Collections onCount={setCollectionCount} onChanged={loadLibrary} />
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
              <SongTable songs={shown} selectedId={selected} onSelect={setSelected} empty={query.trim() ? "No songs match." : show === "getting-ready" ? "Every song is on air." : "No songs here."} />
            </div>
            <div className="ld-pane">
              {current ? <SongPane song={current} onPatched={patchSong} onDeleted={(id) => {
                    dropSong(id);
                    loadLibrary();
                  }} onClose={() => setSelected(null)} preview={preview} /> : status}
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
      {sheet === "status" && (
        <Sheet title="Library status" onClose={() => setSheet(null)}>
          {status}
        </Sheet>
      )}
      {sheet === "upload" && <UploadSong onClose={() => setSheet(null)} onDone={loadLibrary} />}
    </Screen>
  );
}

/** "about 2 h 10 min left (done around 15:40)": an estimate from the recent pace, so it says "about". */
function timeLeft(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const span = h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
  const at = new Date(Date.now() + minutes * 60_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `about ${span} left (done around ${at})`;
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
