"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, ListMusic, Pause, Play, Plus, RefreshCw, Search, X } from "lucide-react";
import { BackButton, formatWhen } from "@/components/admin/ui";
import { confirmDialog, promptDialog, toast } from "@/components/gs/dialogs";
import { Cover, type usePreview } from "./songs";
import { api, duration, type Import, type Playlist, type Song } from "./types";

const SOURCE_LABEL = { youtube: "YouTube", soundcloud: "SoundCloud", spotify: "Spotify" } as const;

function when(iso: string | null): string {
  if (!iso) return "never";
  return formatWhen(iso);
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
    <div className={open ? "ld detail" : "ld"}>
      <div className="ld-list">
        <button type="button" className="item" onClick={create} style={{ color: "var(--a-muted)", fontWeight: 600 }}>
          <span className="thumb" style={{ width: 40, height: 40, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Plus className="ic" />
          </span>
          New playlist
        </button>
        {playlists.length === 0 && <div className="empty">No playlists yet. Importing an album or playlist link makes one.</div>}
        {playlists.map((p) => (
          <button key={p.id} type="button" className={p.id === open ? "item on" : "item"} onClick={() => setOpen(p.id)}>
            <span className="thumb" style={{ width: 40, height: 40, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <ListMusic className="ic faint" />
            </span>
            <span className="grow">
              <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                {p.name}
              </span>
              <span className="meta">
                {p.songs} {p.songs === 1 ? "song" : "songs"}
                {p.source ? ` · from ${SOURCE_LABEL[p.source]}` : ""}
                {syncing.has(p.id) ? " · importing…" : ""}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="ld-pane">
        {open ? (
          <PlaylistDetail key={open} id={open} library={library} syncing={syncing.has(open)} onClose={() => setOpen(null)} onChange={onChange} preview={preview} />
        ) : (
          <div className="pane-empty">Pick a playlist to see and change its songs.</div>
        )}
      </div>
    </div>
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

function PlaylistDetail({
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
  // only send the song list when it changed, so a rename is one small write
  const [listDirty, setListDirty] = useState(false);
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
    setListDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/radio/playlists/${id}`, { method: "PATCH", body: JSON.stringify({ name: name.trim(), ...(listDirty ? { songIds: songs.map((s) => s.id) } : {}) }) });
      setDirty(false);
      setListDirty(false);
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
    if (!(await confirmDialog(`Delete the playlist “${name}”? Its songs stay in the library.`, { ok: "Delete", danger: true }))) return;
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

  if (!playlist) return <div className="pane-empty">Loading…</div>;
  return (
    <>
      {/* Save and Delete stay pinned at the top while the song list scrolls */}
      <div className="pane-head capped">
        <BackButton onClick={() => void close()} label="Back to playlists" />
        <span className="t12 muted">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" className="btn sm ghost danger" onClick={remove}>
            Delete playlist
          </button>
          <button type="button" className="btn sm strong" onClick={save} disabled={busy || !dirty || !name.trim()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </span>
      </div>
      <div className="pane-body capped" style={{ display: "grid", gap: 20 }}>
        <div className="field">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => (setName(e.target.value), setDirty(true))} maxLength={200} />
        </div>

        {playlist.sourceUrl && (
          <div className="card line" style={{ padding: 12 }}>
            <div>
              <a href={playlist.sourceUrl} target="_blank" rel="noopener noreferrer" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                Linked to {playlist.source ? SOURCE_LABEL[playlist.source] : "its source"} <ExternalLink className="ic-sm" aria-hidden />
              </a>
              <div className="help">{syncing ? "Importing now…" : `Last synced ${when(playlist.lastSyncedAt)}`}</div>
            </div>
            <button type="button" className="btn sm" onClick={resync} disabled={syncing || dirty} title={dirty ? "Save your changes first" : undefined}>
              <RefreshCw className="ic-sm" /> Re-sync
            </button>
          </div>
        )}

        <div className="field">
          <label>Add songs from the library</label>
          <div className="search">
            <Search />
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title or artist" />
          </div>
          {matches.length > 0 && (
            <div className="rows">
              {matches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="r item"
                  style={{ padding: "8px 12px" }}
                  onClick={() => {
                    setSongs((l) => [...l, { id: s.id, key: s.key, title: s.title, artist: s.artist, durationSec: s.durationSec, thumbnail: s.thumbnail, archived: s.archived }]);
                    setDirty(true);
                    setListDirty(true);
                  }}
                >
                  <Plus className="ic-sm faint" aria-hidden />
                  <span className="trunc" style={{ flex: 1 }}>
                    <b>{s.title}</b> <span className="muted">· {s.artist}</span>
                  </span>
                  <span className="t12 num muted">{duration(s.durationSec)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div className="line">
            <span className="lbl">
              {songs.length} {songs.length === 1 ? "song" : "songs"}
            </span>
            <span className="t12 muted">{duration(songs.reduce((t, s) => t + s.durationSec, 0))} in all</span>
          </div>
          {songs.length === 0 ? (
            <div className="rows">
              <div className="r muted">No songs yet.</div>
            </div>
          ) : (
            <ol className="rows" style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {songs.map((s, i) => (
                <li key={s.id} className="r" style={{ padding: "6px 12px" }}>
                  <span className="t12 num faint" style={{ width: 22, textAlign: "right" }}>
                    {i + 1}
                  </span>
                  <button type="button" onClick={() => preview.toggle(s.key)} aria-label={preview.playing === s.key ? `Pause ${s.title}` : `Play ${s.title}`} className="iconbtn">
                    {preview.playing === s.key ? <Pause className="ic-sm" /> : <Play className="ic-sm" />}
                  </button>
                  <Cover src={s.thumbnail} size={32} />
                  <div className="grow">
                    <div className="trunc" style={{ fontWeight: 600, textDecoration: s.archived ? "line-through" : undefined, color: s.archived ? "var(--a-faint)" : undefined }}>
                      {s.title}
                    </div>
                    <div className="t12 muted trunc">
                      {s.artist}
                      {s.archived ? " · archived" : ""}
                    </div>
                  </div>
                  <span className="t12 num muted hide-m">{duration(s.durationSec)}</span>
                  <button type="button" className="iconbtn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="ic-sm" />
                  </button>
                  <button type="button" className="iconbtn" aria-label="Move down" disabled={i === songs.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="ic-sm" />
                  </button>
                  <button type="button" className="iconbtn" aria-label={`Remove ${s.title} from the playlist`} onClick={() => (setSongs((l) => l.filter((x) => x.id !== s.id)), setDirty(true), setListDirty(true))}>
                    <X className="ic-sm" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  );
}
