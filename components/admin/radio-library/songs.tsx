"use client";
import React, { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Music, Pause, Pencil, Play, Trash2, X } from "lucide-react";
import { BackButton, Facts, Sheet } from "@/components/admin/ui";
import { confirmDialog, toast } from "@/components/gs/dialogs";
import { integratedLufs, YOUTUBE_REFERENCE_LUFS } from "@/lib/radio/loudness";
import { api, duration, fileUrl, type Song } from "./types";
import { SongLyrics } from "./song-lyrics";

const SOURCE_LABEL: Record<Song["source"], string> = { youtube: "YouTube", soundcloud: "SoundCloud", upload: "Uploaded" };

/** What the album-audio check found (BitChord's resolveAudio, run by the downloader). */
function audioLabel(song: Song): string | null {
  if (song.source !== "youtube") return null;
  switch (song.audioCheck) {
    case "album":
      return "Album version";
    case "swapped":
      return "Album version, swapped in for the video";
    case "unmatched":
      return song.musicVideo ? "Music video: no album version found" : "No album version found";
    case "duplicate":
      return "Archived: its album version is already in the library";
    case "failed":
      return "Not checked: YouTube Music didn't answer (tried again later)";
    case "downloading":
      return "Album version found: queued for download";
    default:
      return "Not checked yet";
  }
}

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
  /** Plays [key] from [sec] (the lyrics preview's lines jump there, as in BitChord). */
  const playFrom = (key: string, sec: number) => {
    if (playing !== key) toggle(key);
    if (audio.current) audio.current.currentTime = Math.max(0, sec);
  };
  /** The preview's element, for the lyrics preview to read where the song is. */
  const element = () => audio.current;
  return { playing, toggle, playFrom, element };
}

export function Cover({ src, size = 40 }: { src: string | null; size?: number }) {
  return src ? (
    <img src={src} alt="" loading="lazy" className="thumb" style={{ width: size, height: size }} />
  ) : (
    <span className="thumb faint" style={{ width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <Music className="ic-sm" aria-hidden />
    </span>
  );
}

const added = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

/** The songs as a table: cover, title, artist, album, length, source, added. A row opens the song on the right. */
export function SongTable({ songs, selectedId, onSelect, archivedView }: { songs: Song[]; selectedId: string | null; onSelect: (id: string) => void; archivedView: boolean }) {
  if (!songs.length) return <div className="empty">{archivedView ? "No archived songs." : "No songs match."}</div>;
  return (
    <table className="table phone-auto">
      <thead>
        <tr>
          <th style={{ width: 56 }} aria-label="Cover" />
          <th>Title</th>
          <th style={{ width: "22%" }}>Artist</th>
          <th className="hide-m" style={{ width: "20%" }}>
            Album
          </th>
          <th className="num" style={{ width: 72 }}>
            Length
          </th>
          <th className="hide-m" style={{ width: 104 }}>
            Source
          </th>
          <th className="hide-m" style={{ width: 96 }}>
            Added
          </th>
        </tr>
      </thead>
      <tbody>
        {songs.map((s) => (
          <tr key={s.id} className={s.id === selectedId ? "click on" : "click"} onClick={() => onSelect(s.id)}>
            <td style={{ paddingTop: 2, paddingBottom: 2 }}>
              <Cover src={s.thumbnail} size={32} />
            </td>
            <td style={{ fontWeight: 600 }} title={s.title}>
              {s.title}
            </td>
            <td title={s.artist}>{s.artist}</td>
            <td className="hide-m muted" title={s.album || ""}>
              {s.album || ""}
            </td>
            <td className="num muted">{duration(s.durationSec)}</td>
            <td className="hide-m muted">{SOURCE_LABEL[s.source]}</td>
            <td className="hide-m muted">{added(s.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The song picked in the table: listen, its facts, edit, archive, delete. */
export function SongPane({
  song,
  onPatched,
  onDeleted,
  onClose,
  preview,
}: {
  song: Song;
  onPatched: (id: string, patch: Partial<Song>) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
  preview: ReturnType<typeof usePreview>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setEditing(false);
    setTitle(song.title);
    setArtist(song.artist);
  }, [song.id, song.title, song.artist]);

  const setArchived = async (archived: boolean) => {
    try {
      await api(`/api/admin/radio/songs/${song.id}`, { method: "PATCH", body: JSON.stringify({ archived }) });
      toast(archived ? `“${song.title}” archived. The radio won't pick it any more.` : `“${song.title}” is back in the library.`);
      onPatched(song.id, { archived });
    } catch (err: any) {
      toast(err.message);
    }
  };
  const remove = async () => {
    if (!(await confirmDialog(`Delete “${song.title}” for good? The file is removed and it leaves every playlist. This can't be undone.`, { ok: "Delete", danger: true }))) return;
    try {
      await api(`/api/admin/radio/songs/${song.id}`, { method: "DELETE" });
      onClose();
      onDeleted(song.id);
    } catch (err: any) {
      toast(err.message);
    }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/admin/radio/songs/${song.id}`, { method: "PATCH", body: JSON.stringify({ title, artist }) });
      setEditing(false);
      onPatched(song.id, { title: title.trim(), artist: artist.trim() });
    } catch (err: any) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };
  const playing = preview.playing === song.key;

  return (
    <>
      <div className="pane-head">
        <BackButton onClick={onClose} label="Back to songs" />
        <span className="trunc" style={{ fontWeight: 600, flex: 1 }}>
          {song.archived ? "Archived song" : "Song"}
        </span>
        <button type="button" className="iconbtn hide-m" aria-label="Close" onClick={onClose}>
          <X className="ic" />
        </button>
      </div>
      <div className="pane-body" style={{ display: "grid", gap: 16 }}>
        <div style={{ position: "relative", width: "100%", maxWidth: 292 }}>
          {song.thumbnail ? (
            <img src={song.thumbnail} alt="" className="thumb" style={{ width: "100%", height: "auto", aspectRatio: "1", borderRadius: 8 }} />
          ) : (
            <span className="thumb faint" style={{ width: "100%", aspectRatio: "1", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Music style={{ width: 40, height: 40 }} />
            </span>
          )}
        </div>
        {editing ? (
          <form onSubmit={save} style={{ display: "grid", gap: 10 }}>
            <div className="field">
              <label>Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required autoFocus />
            </div>
            <div className="field">
              <label>Artist</label>
              <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={300} required />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn strong" disabled={busy || !title.trim() || !artist.trim()}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" className="btn strong icon" onClick={() => preview.toggle(song.key)} aria-label={playing ? `Pause ${song.title}` : `Play ${song.title}`}>
              {playing ? <Pause className="ic" /> : <Play className="ic" />}
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.3 }}>{song.title}</div>
              <div className="muted">{song.artist}</div>
            </div>
          </div>
        )}
        <Facts
          rows={[
            ["Album", [song.album, song.releaseYear].filter(Boolean).join(" · ") || "Unknown"],
            ["Length", duration(song.durationSec)],
            [
              "Source",
              song.sourceUrl ? (
                <a key="s" href={song.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
                  {SOURCE_LABEL[song.source]}
                </a>
              ) : (
                SOURCE_LABEL[song.source]
              ),
            ],
            ...(audioLabel(song)
              ? [
                  [
                    "Audio",
                    <span key="a">
                      {audioLabel(song)}
                      {song.audioCheckNote && <span className="muted t12" style={{ display: "block" }}>{song.audioCheckNote}</span>}
                    </span>,
                  ] as [string, React.ReactNode],
                ]
              : []),
            ["Loudness", song.loudnessDb == null ? "Not known (no levelling)" : `${song.loudnessDb > 0 ? "+" : ""}${song.loudnessDb.toFixed(1)} dB`],
            ["Added", added(song.createdAt)],
            ["File", <span key="f" className="t12" style={{ fontFamily: "ui-monospace, monospace", overflowWrap: "anywhere" }}>{song.key}</span>],
          ]}
        />
        {!editing && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn sm" onClick={() => setEditing(true)}>
              <Pencil className="ic-sm" /> Edit
            </button>
            <button type="button" className="btn sm" onClick={() => setArchived(!song.archived)} title={song.archived ? "Put it back in the library" : "Hide it from the radio"}>
              {song.archived ? <ArchiveRestore className="ic-sm" /> : <Archive className="ic-sm" />}
              {song.archived ? "Unarchive" : "Archive"}
            </button>
            <button type="button" className="btn sm ghost danger" onClick={remove}>
              <Trash2 className="ic-sm" /> Delete
            </button>
          </div>
        )}
        <SongLyrics song={song} preview={preview} onPatched={onPatched} />
      </div>
    </>
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

  const ready = !!file && !!measure && !!title.trim() && !!artist.trim() && progress === null;
  return (
    <Sheet
      title="Upload a song"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="upload-song" className="btn primary" disabled={!ready}>
            {progress !== null ? `Uploading ${progress}%` : "Upload"}
          </button>
        </>
      }
    >
      <form id="upload-song" onSubmit={upload} style={{ display: "grid", gap: 16 }}>
        <p className="muted" style={{ margin: 0 }}>
          For songs that aren&apos;t on YouTube or SoundCloud. .m4a, .aac or .mp3, up to 40 MB.
        </p>
        <div className="field">
          <label>File</label>
          <input type="file" accept=".m4a,.mp4,.aac,.mp3,audio/mp4,audio/aac,audio/mpeg" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          {status ? (
            <div className="help">{status}</div>
          ) : measure ? (
            <div className="help">
              {duration(measure.durationSec)} long, loudness {measure.loudnessDb > 0 ? "+" : ""}
              {measure.loudnessDb} dB (the radio levels it like a YouTube song).
            </div>
          ) : null}
        </div>
        <div className="field">
          <label>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required />
        </div>
        <div className="field">
          <label>Artist</label>
          <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={300} required />
        </div>
        {progress !== null && (
          <div className="meter" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${progress}%` }} />
          </div>
        )}
      </form>
    </Sheet>
  );
}
