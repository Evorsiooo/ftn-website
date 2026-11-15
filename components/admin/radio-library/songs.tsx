"use client";
import React, { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Music, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminDrawer } from "@/components/gs/admin-drawer";
import { AdminField } from "@/components/gs/admin-form";
import { confirmDialog, toast } from "@/components/gs/dialogs";
import { integratedLufs, YOUTUBE_REFERENCE_LUFS } from "@/lib/radio/loudness";
import { api, duration, fileUrl, type Song } from "./types";

const SOURCE_LABEL: Record<Song["source"], string> = { youtube: "YouTube", soundcloud: "SoundCloud", upload: "Uploaded" };

/** One shared <audio> for listening to songs on the page. */
export function usePreview() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = (key: string) => {
    if (!audio.current) {
      audio.current = new Audio();
      audio.current.addEventListener("ended", () => setPlaying(null));
      audio.current.addEventListener("error", () => {
        setPlaying(null);
        toast("Could not play this file.");
      });
    }
    if (playing === key) {
      audio.current.pause();
      setPlaying(null);
      return;
    }
    audio.current.src = fileUrl(key);
    audio.current.play().catch(() => setPlaying(null));
    setPlaying(key);
  };
  return { playing, toggle };
}

export function Cover({ src, className = "h-11 w-11" }: { src: string | null; className?: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className={`${className} shrink-0 rounded-lg object-cover`} />
  ) : (
    <div className={`${className} flex shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400 dark:bg-neutral-800`}>
      <Music className="h-4 w-4" aria-hidden />
    </div>
  );
}

export function SongList({ songs, archivedView, onChange, preview }: { songs: Song[]; archivedView: boolean; onChange: () => void; preview: ReturnType<typeof usePreview> }) {
  const [editing, setEditing] = useState<Song | null>(null);

  const setArchived = async (s: Song, archived: boolean) => {
    try {
      await api(`/api/admin/radio/songs/${s.id}`, { method: "PATCH", body: JSON.stringify({ archived }) });
      toast(archived ? `“${s.title}” archived. The radio won't pick it any more.` : `“${s.title}” is back in the library.`);
      onChange();
    } catch (err: any) {
      toast(err.message);
    }
  };

  const remove = async (s: Song) => {
    if (!(await confirmDialog(`Delete “${s.title}” for good? The file is removed and it leaves every playlist. This can't be undone.`))) return;
    try {
      await api(`/api/admin/radio/songs/${s.id}`, { method: "DELETE" });
      onChange();
    } catch (err: any) {
      toast(err.message);
    }
  };

  if (!songs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
        {archivedView ? "No archived songs." : "No songs match."}
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
        {songs.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <button
              type="button"
              onClick={() => preview.toggle(s.key)}
              aria-label={preview.playing === s.key ? `Pause ${s.title}` : `Play ${s.title}`}
              className="group relative shrink-0 cursor-pointer"
            >
              <Cover src={s.thumbnail} />
              <span className={`absolute inset-0 flex items-center justify-center rounded-lg bg-black/55 text-white transition ${preview.playing === s.key ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}>
                {preview.playing === s.key ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{s.title}</div>
              <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                <span className="tabular-nums sm:hidden">{duration(s.durationSec)} · </span>
                {s.artist}
                {s.album ? ` · ${s.album}` : ""}
              </div>
            </div>
            <div className="hidden w-24 shrink-0 text-xs text-neutral-500 md:block">
              {s.sourceUrl ? (
                <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{SOURCE_LABEL[s.source]}</a>
              ) : (
                SOURCE_LABEL[s.source]
              )}
            </div>
            <div className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-neutral-500 sm:block">{duration(s.durationSec)}</div>
            <div className="flex shrink-0 items-center">
              <Button size="icon-sm" variant="ghost" className="cursor-pointer" aria-label={`Edit ${s.title}`} title="Edit" onClick={() => setEditing(s)}>
                <Pencil />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="cursor-pointer"
                aria-label={archivedView ? `Unarchive ${s.title}` : `Archive ${s.title}`}
                title={archivedView ? "Unarchive" : "Archive (hide from the radio)"}
                onClick={() => setArchived(s, !archivedView)}
              >
                {archivedView ? <ArchiveRestore /> : <Archive />}
              </Button>
              <Button size="icon-sm" variant="ghost" className="cursor-pointer hover:text-red-600" aria-label={`Delete ${s.title}`} title="Delete for good" onClick={() => remove(s)}>
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {editing && <EditSong song={editing} onClose={() => setEditing(null)} onSaved={onChange} />}
    </>
  );
}

function EditSong({ song, onClose, onSaved }: { song: Song; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/admin/radio/songs/${song.id}`, { method: "PATCH", body: JSON.stringify({ title, artist }) });
      onSaved();
      onClose();
    } catch (err: any) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminDrawer title="Edit song" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <AdminField label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
        </AdminField>
        <AdminField label="Artist">
          <Input value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={300} required />
        </AdminField>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-neutral-500">Length</dt><dd>{duration(song.durationSec)}</dd></div>
          <div><dt className="text-xs text-neutral-500">Loudness</dt><dd>{song.loudnessDb == null ? "Not known (no levelling)" : `${song.loudnessDb > 0 ? "+" : ""}${song.loudnessDb.toFixed(1)} dB`}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-neutral-500">File</dt><dd className="break-all font-mono text-xs">{song.key}</dd></div>
        </dl>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" className="cursor-pointer" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="cursor-pointer" disabled={busy || !title.trim() || !artist.trim()}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </AdminDrawer>
  );
}

/** "Artist - Title.m4a" → both fields; otherwise the name is the title. */
function guessFromName(name: string): { title: string; artist: string } {
  const base = name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  const m = base.match(/^(.+?)\s+[-–]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: "", title: base };
}

/** Upload a file straight to the library. Length and loudness are measured here, in this browser. */
export function UploadSong({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [measure, setMeasure] = useState<{ durationSec: number; loudnessDb: number } | null>(null);
  const [status, setStatus] = useState<string>("");
  const [progress, setProgress] = useState<number | null>(null);

  const pick = async (f: File | null) => {
    setFile(f);
    setMeasure(null);
    if (!f) return;
    const g = guessFromName(f.name);
    setTitle(g.title);
    setArtist(g.artist);
    setStatus("Measuring length and loudness…");
    try {
      // 44.1 kHz like the radio engine's analysis, so every browser measures the same samples
      const ctx = new AudioContext({ sampleRate: 44100 });
      const buffer = await ctx.decodeAudioData(await f.arrayBuffer());
      await ctx.close();
      const lufs = integratedLufs(buffer);
      setMeasure({ durationSec: buffer.duration, loudnessDb: Math.round((lufs - YOUTUBE_REFERENCE_LUFS) * 10) / 10 });
      setStatus("");
    } catch {
      setStatus("This browser can't read that file. Use an .m4a or .mp3.");
    }
  };

  const upload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !measure) return;
    const form = new FormData();
    form.set("file", file);
    form.set("title", title.trim());
    form.set("artist", artist.trim());
    form.set("durationSec", String(measure.durationSec));
    form.set("loudnessDb", String(measure.loudnessDb));
    // XHR for upload progress
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/radio/upload");
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        toast(`“${title.trim()}” added.`);
        onDone();
        onClose();
      } else {
        let msg = "Upload failed.";
        try {
          msg = JSON.parse(xhr.responseText).error || msg;
        } catch {}
        toast(msg);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      toast("Upload failed.");
    };
    setProgress(0);
    xhr.send(form);
  };

  return (
    <AdminDrawer title="Upload a song" onClose={onClose}>
      <form onSubmit={upload} className="space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">For songs that aren&apos;t on YouTube or SoundCloud. .m4a, .aac or .mp3, up to 40 MB.</p>
        <AdminField label="File">
          <input
            type="file"
            accept=".m4a,.mp4,.aac,.mp3,audio/mp4,audio/aac,audio/mpeg"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-xs file:font-bold file:text-white dark:file:bg-white dark:file:text-neutral-900"
          />
        </AdminField>
        {status && <p className="text-sm text-neutral-500">{status}</p>}
        {measure && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {duration(measure.durationSec)} long, loudness {measure.loudnessDb > 0 ? "+" : ""}
            {measure.loudnessDb} dB (the radio levels it like a YouTube song).
          </p>
        )}
        <AdminField label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
        </AdminField>
        <AdminField label="Artist">
          <Input value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={300} required />
        </AdminField>
        {progress !== null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" className="cursor-pointer" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="cursor-pointer" disabled={!file || !measure || !title.trim() || !artist.trim() || progress !== null}>
            {progress !== null ? `Uploading ${progress}%` : "Upload"}
          </Button>
        </div>
      </form>
    </AdminDrawer>
  );
}
