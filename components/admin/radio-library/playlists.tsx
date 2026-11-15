"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Pause, Play, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminDrawer } from "@/components/gs/admin-drawer";
import { AdminField } from "@/components/gs/admin-form";
import { confirmDialog, promptDialog, toast } from "@/components/gs/dialogs";
import { Cover, type usePreview } from "./songs";
import { api, duration, type Import, type Playlist, type Song } from "./types";

const SOURCE_LABEL = { youtube: "YouTube", soundcloud: "SoundCloud", spotify: "Spotify" } as const;

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function PlaylistList({
  playlists,
  imports,
  library,
  onChange,
  preview,
}: {
  playlists: Playlist[];
  imports: Import[];
  library: Song[];
  onChange: () => void;
  preview: ReturnType<typeof usePreview>;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const create = async () => {
    const name = (await promptDialog("Name of the new playlist"))?.trim();
    if (!name) return;
    try {
      const { playlist } = await api<{ playlist: Playlist }>("/api/admin/radio/playlists", { method: "POST", body: JSON.stringify({ name }) });
      onChange();
      setOpen(playlist.id);
    } catch (err: any) {
      toast(err.message);
    }
  };

  const syncing = new Set(imports.filter((i) => i.playlistId && !["done", "failed", "cancelled"].includes(i.state)).map((i) => i.playlistId));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={create}
          className="flex min-h-28 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 text-sm font-bold text-neutral-500 transition hover:border-neutral-500 hover:text-neutral-900 dark:border-neutral-700 dark:hover:text-white"
        >
          <Plus className="h-4 w-4" /> New playlist
        </button>
        {playlists.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(p.id)}
            className="flex min-h-28 cursor-pointer flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-600"
          >
            <div className="line-clamp-2 font-bold">{p.name}</div>
            <div className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
              {p.songs} {p.songs === 1 ? "song" : "songs"}
              {p.source ? ` · from ${SOURCE_LABEL[p.source]}` : ""}
              {syncing.has(p.id) ? " · importing…" : ""}
            </div>
          </button>
        ))}
      </div>
      {open && <PlaylistDrawer id={open} library={library} syncing={syncing.has(open)} onClose={() => setOpen(null)} onChange={onChange} preview={preview} />}
    </>
  );
}

interface PlaylistSong {
  id: string;
  key: string;
  title: string;
  artist: string;
  durationSec: number;
  thumbnail: string | null;
  archived: boolean;
}

function PlaylistDrawer({
  id,
  library,
  syncing,
  onClose,
  onChange,
  preview,
}: {
  id: string;
  library: Song[];
  syncing: boolean;
  onClose: () => void;
  onChange: () => void;
  preview: ReturnType<typeof usePreview>;
}) {
  const [playlist, setPlaylist] = useState<(Playlist & { sourceUrl: string | null }) | null>(null);
  const [name, setName] = useState("");
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api<{ playlist: Playlist; songs: PlaylistSong[] }>(`/api/admin/radio/playlists/${id}`)
      .then((d) => {
        setPlaylist(d.playlist);
        setName(d.playlist.name);
        setSongs(d.songs);
      })
      .catch((err) => toast(err.message));
  }, [id, syncing]);

  const inList = useMemo(() => new Set(songs.map((s) => s.id)), [songs]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return library.filter((s) => !s.archived && !inList.has(s.id) && `${s.title} ${s.artist}`.toLowerCase().includes(q)).slice(0, 8);
  }, [query, library, inList]);

  const move = (i: number, by: number) => {
    const next = [...songs];
    const [s] = next.splice(i, 1);
    next.splice(i + by, 0, s);
    setSongs(next);
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/radio/playlists/${id}`, { method: "PATCH", body: JSON.stringify({ name: name.trim(), songIds: songs.map((s) => s.id) }) });
      setDirty(false);
      onChange();
      toast("Playlist saved.");
    } catch (err: any) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resync = async () => {
    try {
      await api(`/api/admin/radio/playlists/${id}/resync`, { method: "POST" });
      toast("Re-sync started. New songs appear as they download.");
      onChange();
    } catch (err: any) {
      toast(err.message);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog(`Delete the playlist “${name}”? Its songs stay in the library.`))) return;
    try {
      await api(`/api/admin/radio/playlists/${id}`, { method: "DELETE" });
      onChange();
      onClose();
    } catch (err: any) {
      toast(err.message);
    }
  };

  const close = async () => {
    if (dirty && !(await confirmDialog("Leave without saving your changes to this playlist?"))) return;
    onClose();
  };

  return (
    <AdminDrawer title="Playlist" onClose={close} wide>
      {!playlist ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : (
        <div className="space-y-6">
          <AdminField label="Name">
            <Input value={name} onChange={(e) => (setName(e.target.value), setDirty(true))} maxLength={200} />
          </AdminField>

          {playlist.sourceUrl && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <div className="min-w-0">
                <a href={playlist.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold hover:underline">
                  Linked to {playlist.source ? SOURCE_LABEL[playlist.source] : "its source"} <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                </a>
                <div className="text-xs text-neutral-500">{syncing ? "Importing now…" : `Last synced ${when(playlist.lastSyncedAt)}`}</div>
              </div>
              <Button size="sm" variant="outline" className="cursor-pointer" onClick={resync} disabled={syncing || dirty} title={dirty ? "Save your changes first" : undefined}>
                <RefreshCw /> Re-sync
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <AdminField label="Add songs from the library">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title or artist" />
            </AdminField>
            {matches.length > 0 && (
              <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {matches.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSongs((l) => [...l, { id: s.id, key: s.key, title: s.title, artist: s.artist, durationSec: s.durationSec, thumbnail: s.thumbnail, archived: s.archived }]);
                        setDirty(true);
                      }}
                      className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                    >
                      <Plus className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm"><span className="font-bold">{s.title}</span> <span className="text-neutral-500">· {s.artist}</span></span>
                      <span className="text-xs tabular-nums text-neutral-500">{duration(s.durationSec)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-bold">{songs.length} {songs.length === 1 ? "song" : "songs"}</h3>
              <span className="text-xs text-neutral-500">{duration(songs.reduce((t, s) => t + s.durationSec, 0))} in all</span>
            </div>
            {songs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">No songs yet.</p>
            ) : (
              <ol className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {songs.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-6 text-right text-xs tabular-nums text-neutral-400">{i + 1}</span>
                    <button type="button" onClick={() => preview.toggle(s.key)} aria-label={preview.playing === s.key ? `Pause ${s.title}` : `Play ${s.title}`} className="group relative shrink-0 cursor-pointer">
                      <Cover src={s.thumbnail} className="h-9 w-9" />
                      <span className={`absolute inset-0 flex items-center justify-center rounded-lg bg-black/55 text-white transition ${preview.playing === s.key ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                        {preview.playing === s.key ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-bold ${s.archived ? "text-neutral-400 line-through" : ""}`}>{s.title}</div>
                      <div className="truncate text-xs text-neutral-500">{s.artist}{s.archived ? " · archived" : ""}</div>
                    </div>
                    <span className="hidden text-xs tabular-nums text-neutral-500 sm:inline">{duration(s.durationSec)}</span>
                    <div className="flex shrink-0">
                      <Button size="icon-sm" variant="ghost" className="cursor-pointer" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                      <Button size="icon-sm" variant="ghost" className="cursor-pointer" aria-label="Move down" disabled={i === songs.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                      <Button size="icon-sm" variant="ghost" className="cursor-pointer" aria-label={`Remove ${s.title} from the playlist`} onClick={() => (setSongs((l) => l.filter((x) => x.id !== s.id)), setDirty(true))}><X /></Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <Button variant="destructive" className="cursor-pointer" onClick={remove}>Delete playlist</Button>
            <Button className="cursor-pointer" onClick={save} disabled={busy || !dirty || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      )}
    </AdminDrawer>
  );
}
