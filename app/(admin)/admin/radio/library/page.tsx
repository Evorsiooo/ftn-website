"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader, AdminTab } from "@/components/gs/admin-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canManageRadio } from "@/lib/rbac";
import { AddSongs, ReviewMatches } from "@/components/admin/radio-library/add-songs";
import { SongList, UploadSong, usePreview } from "@/components/admin/radio-library/songs";
import { PlaylistList } from "@/components/admin/radio-library/playlists";
import { api, FINAL, type Import, type Playlist, type Review, type Song } from "@/components/admin/radio-library/types";

type Tab = "songs" | "playlists" | "archived";

export default function RadioLibraryPage() {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [imports, setImports] = useState<Import[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("songs");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const preview = usePreview();

  const loadLibrary = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        api<{ songs: Song[] }>("/api/admin/radio/songs"),
        api<{ playlists: Playlist[] }>("/api/admin/radio/playlists"),
      ]);
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
      // reload songs when an import has added some since the last look
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
  }, [loadLibrary, loadImports]);

  useEffect(() => {
    reload();
  }, [reload]);

  const active = imports.some((i) => !FINAL.includes(i.state));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(loadImports, 4000);
    return () => clearInterval(t);
  }, [active, loadImports]);

  const live = useMemo(() => (songs || []).filter((s) => !s.archived), [songs]);
  const archived = useMemo(() => (songs || []).filter((s) => s.archived), [songs]);
  const shown = useMemo(() => {
    const list = tab === "archived" ? archived : live;
    const q = query.trim().toLowerCase();
    return q ? list.filter((s) => `${s.title} ${s.artist} ${s.album || ""}`.toLowerCase().includes(q)) : list;
  }, [tab, live, archived, query]);

  return (
    <AdminAuthGuard requiredPermission={canManageRadio} featureTitle="Song library">
      <div className="w-full space-y-8 text-neutral-900 dark:text-white">
        <AdminPageHeader
          title="Song library"
          description="The songs the radio plays. Every song here that isn't archived can come up on the AutoDJ."
          actions={
            <>
              <Link href="/admin/radio" className="gs-bar-link pb-0.5 text-sm font-bold">← Schedule</Link>
              <Button size="sm" variant="outline" onClick={() => setUploading(true)} className="h-10 cursor-pointer px-5 text-sm">
                <Upload /> Upload a file
              </Button>
            </>
          }
        />

        <AddSongs imports={imports} onChange={reload} />
        <ReviewMatches reviews={reviews} onChange={reload} />

        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex gap-1 overflow-x-auto">
              <AdminTab active={tab === "songs"} onClick={() => setTab("songs")}>Songs {songs ? `(${live.length})` : ""}</AdminTab>
              <AdminTab active={tab === "playlists"} onClick={() => setTab("playlists")}>Playlists ({playlists.length})</AdminTab>
              <AdminTab active={tab === "archived"} onClick={() => setTab("archived")}>Archived {songs ? `(${archived.length})` : ""}</AdminTab>
            </div>
            {tab !== "playlists" && (
              <div className="w-full pb-2 sm:w-72">
                <label htmlFor="radio-library-search" className="sr-only">Search songs</label>
                <Input id="radio-library-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, artist or album" />
              </div>
            )}
          </div>

          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !songs ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : tab === "playlists" ? (
            <PlaylistList playlists={playlists} imports={imports} library={songs} onChange={reload} preview={preview} />
          ) : songs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
              <p className="font-bold">The library is empty.</p>
              <p className="mt-1 text-sm text-neutral-500">Paste a song or playlist link above to add the first songs.</p>
            </div>
          ) : (
            <SongList songs={shown} archivedView={tab === "archived"} onChange={loadLibrary} preview={preview} />
          )}
        </div>
      </div>
      {uploading && <UploadSong onClose={() => setUploading(false)} onDone={loadLibrary} />}
    </AdminAuthGuard>
  );
}
