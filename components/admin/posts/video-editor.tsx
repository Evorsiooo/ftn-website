"use client";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Music, Pause, Play, Redo2, Scissors, Trash2, Undo2, Upload, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PostLayers } from "@/lib/post-template";
import { exportPostVideo } from "@/lib/post-video/export";
import { exportAnimatedWebp } from "@/lib/post-video/webp";
import {
  MAX_DURATION,
  MAX_VIDEO_BYTES,
  MIN_CLIP,
  clipAt,
  clipLength,
  emptyProject,
  newId,
  parseSavedEdit,
  projectDuration,
  type MusicClip,
  type Project,
  type SavedEdit,
  type VideoClip,
} from "@/lib/post-video/model";
import { detectFraming } from "@/lib/post-video/autofit";
import { PreviewPlayer } from "@/lib/post-video/preview";
import { disposeSource, loadSource, type LoadedSource } from "@/lib/post-video/sources";
import { uploadMedia } from "@/lib/post-video/upload";
import { VideoTimeline } from "./video-timeline";

const labelClass = "block text-xs font-semibold uppercase text-neutral-600 dark:text-neutral-400 mb-1";
const HISTORY_LIMIT = 60;
const GESTURE_WINDOW_MS = 1200;

export interface VideoEditorHandle {
  hasVideo: () => boolean;
  /** Renders the video, uploads it with its still image and returns what the post stores. */
  prepareSave: () => Promise<{ videoUrl: string; imageUrl: string; videoEdit: string }>;
  /** Renders the video and downloads it, without saving anything. */
  downloadVideo: (name: string) => Promise<void>;
  loadFromPost: (post: { videoEdit: string | null }) => Promise<void>;
  reset: () => void;
}

interface Props {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  layers: PostLayers | null;
  /** Uploads the still image of the video (a PNG) and returns its URL. */
  uploadPoster: (poster: Blob) => Promise<string>;
  /** Export a transparent animated WebP (no sound) instead of an MP4. */
  animatedWebp?: boolean;
  /** Where the timeline and clip controls go (full page width). Without it they stay in place. */
  timelineHost?: HTMLElement | null;
}

type UploadState = { progress: number; error?: string };

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export const VideoEditor = forwardRef<VideoEditorHandle, Props>(function VideoEditor({ canvasRef, layers, uploadPoster, animatedWebp = false, timelineHost }, ref) {
  const [sources, setSources] = useState<Map<string, LoadedSource>>(new Map());
  const [project, setProject] = useState<Project>(emptyProject());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [loading, setLoading] = useState("");
  const [rendering, setRendering] = useState<{ fraction: number; label: string } | null>(null);
  const [error, setError] = useState("");

  const player = useRef<PreviewPlayer | null>(null);
  const uploadPromises = useRef(new Map<string, Promise<string>>());
  const sourcesRef = useRef(sources);
  const projectRef = useRef(project);
  const history = useRef<{ past: Project[]; future: Project[]; gesture: string; at: number }>({
    past: [],
    future: [],
    gesture: "",
    at: 0,
  });
  const abort = useRef<AbortController | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const songInput = useRef<HTMLInputElement>(null);

  sourcesRef.current = sources;
  projectRef.current = project;

  const total = projectDuration(project);
  const selectedClip = project.clips.find((c) => c.id === selectedId) ?? null;
  const selectedMusic = project.music.find((m) => m.id === selectedId) ?? null;

  // The preview player lives as long as the editor.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = new PreviewPlayer(canvas, setTime, setPlaying);
    player.current = p;
    p.setSources(sourcesRef.current);
    p.setProject(projectRef.current);
    return () => {
      p.dispose();
      player.current = null;
    };
  }, [canvasRef]);
  useEffect(() => player.current?.setSources(sources), [sources]);
  useEffect(() => player.current?.setProject(project), [project]);
  useEffect(() => player.current?.setLayers(layers), [layers]);

  // Every imported file is released when the editor closes.
  useEffect(
    () => () => {
      sourcesRef.current.forEach(disposeSource);
    },
    []
  );

  // Changes to the edit. Edits of one kind in quick succession (dragging, a slider) count as one undo step.
  const update = useCallback((next: Project, gesture = "") => {
    const h = history.current;
    const now = Date.now();
    if (!(gesture && gesture === h.gesture && now - h.at < GESTURE_WINDOW_MS)) {
      h.past.push(projectRef.current);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
    }
    h.future = [];
    h.gesture = gesture;
    h.at = now;
    projectRef.current = next;
    setProject(next);
  }, []);

  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(projectRef.current);
    h.gesture = "";
    projectRef.current = prev;
    setProject(prev);
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(projectRef.current);
    h.gesture = "";
    projectRef.current = next;
    setProject(next);
  };

  const startUpload = (source: LoadedSource) => {
    const id = source.info.id;
    setUploads((u) => ({ ...u, [id]: { progress: 0 } }));
    const promise = uploadMedia(source.file, {
      kind: source.info.kind === "music" ? "music" : "source",
      name: source.info.name,
      onProgress: (progress) => setUploads((u) => ({ ...u, [id]: { progress } })),
    }).then(
      (url) => {
        setUploads((u) => ({ ...u, [id]: { progress: 1 } }));
        setSources((prev) => {
          const s = prev.get(id);
          if (!s) return prev;
          const next = new Map(prev);
          next.set(id, { ...s, info: { ...s.info, url } });
          return next;
        });
        return url;
      },
      (err) => {
        setUploads((u) => ({ ...u, [id]: { progress: 0, error: err?.message || "Upload failed" } }));
        throw err;
      }
    );
    promise.catch(() => {});
    uploadPromises.current.set(id, promise);
  };

  const addVideos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");
    for (const file of Array.from(files)) {
      if (projectDuration(projectRef.current) >= MAX_DURATION - MIN_CLIP) {
        setError(`The video is already ${MAX_DURATION} seconds long. Remove or shorten a clip first.`);
        break;
      }
      setLoading(`Reading ${file.name}...`);
      try {
        const source = await loadSource(file, file.name, "video", null);
        setSources((prev) => new Map(prev).set(source.info.id, source));
        sourcesRef.current = new Map(sourcesRef.current).set(source.info.id, source);
        const room = MAX_DURATION - projectDuration(projectRef.current);
        const clip: VideoClip = {
          id: newId(),
          sourceId: source.info.id,
          start: 0,
          end: Math.min(source.info.duration, room),
          volume: 1,
          zoom: 1,
          focusX: 0.5,
          focusY: 0.5,
        };
        // Fill the video area, cropping black bars that are part of the recording.
        Object.assign(clip, await detectFraming(source, clip.start, clip.end));
        update({ ...projectRef.current, clips: [...projectRef.current.clips, clip] });
        setSelectedId(clip.id);
        if (source.info.duration > room) {
          setError(`Only the first ${room.toFixed(1)} seconds of ${file.name} fit in the ${MAX_DURATION} second limit.`);
        }
        startUpload(source);
      } catch (err: any) {
        setError(`${file.name}: ${err?.message || "Could not read this file."}`);
      }
    }
    setLoading("");
    if (videoInput.current) videoInput.current.value = "";
  };

  const addSong = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError("");
    setLoading(`Reading ${file.name}...`);
    try {
      const source = await loadSource(file, file.name, "music", null);
      setSources((prev) => new Map(prev).set(source.info.id, source));
      sourcesRef.current = new Map(sourcesRef.current).set(source.info.id, source);
      const videoLength = projectDuration(projectRef.current);
      const length = Math.min(source.info.duration, videoLength > 0 ? videoLength : MAX_DURATION);
      const song: MusicClip = {
        id: newId(),
        sourceId: source.info.id,
        start: 0,
        end: length,
        at: 0,
        volume: 0.6,
        fadeIn: 0,
        fadeOut: 1,
      };
      // Put it after the songs already on the timeline when there is room, else at the start.
      const lastEnd = Math.max(0, ...projectRef.current.music.map((m) => m.at + (m.end - m.start)));
      const duration = projectDuration(projectRef.current);
      if (lastEnd > 0 && duration - lastEnd > MIN_CLIP) {
        song.at = lastEnd;
        song.end = Math.min(source.info.duration, duration - lastEnd);
      }
      update({ ...projectRef.current, music: [...projectRef.current.music, song] });
      setSelectedId(song.id);
      startUpload(source);
    } catch (err: any) {
      setError(`${file.name}: ${err?.message || "Could not read this file."}`);
    }
    setLoading("");
    if (songInput.current) songInput.current.value = "";
  };

  const togglePlay = () => {
    const p = player.current;
    if (!p) return;
    if (p.isPlaying) p.pause();
    else p.play();
  };

  const seek = (t: number) => {
    player.current?.pause();
    player.current?.seek(t);
  };

  // Splits the selected piece at the playhead, or the video clip under it.
  const split = () => {
    const t = player.current?.time ?? time;
    const p = projectRef.current;
    const music = p.music.find((m) => m.id === selectedId);
    if (music && t > music.at + MIN_CLIP && t < music.at + (music.end - music.start) - MIN_CLIP) {
      const cut = music.start + (t - music.at);
      const right: MusicClip = { ...music, id: newId(), start: cut, at: t, fadeIn: 0 };
      const left: MusicClip = { ...music, end: cut, fadeOut: 0 };
      update({ ...p, music: p.music.flatMap((m) => (m.id === music.id ? [left, right] : [m])) });
      return;
    }
    const hit = clipAt(p.clips, Math.min(t, total - 0.001));
    if (!hit) return;
    const local = t - hit.at;
    if (local < MIN_CLIP || clipLength(hit.clip) - local < MIN_CLIP) {
      setError("Move the playhead into a clip, away from its edges, to split it.");
      return;
    }
    setError("");
    const cut = hit.clip.start + local;
    const left: VideoClip = { ...hit.clip, end: cut };
    const right: VideoClip = { ...hit.clip, id: newId(), start: cut };
    update({ ...p, clips: p.clips.flatMap((c) => (c.id === hit.clip.id ? [left, right] : [c])) });
    setSelectedId(right.id);
  };

  const removeSelected = () => {
    const p = projectRef.current;
    if (!selectedId) return;
    update({
      clips: p.clips.filter((c) => c.id !== selectedId),
      music: p.music.filter((m) => m.id !== selectedId),
    });
    setSelectedId(null);
  };

  const setClip = (patch: Partial<VideoClip>, gesture: string, all = false) => {
    const p = projectRef.current;
    update({ ...p, clips: p.clips.map((c) => (all || c.id === selectedId ? { ...c, ...patch } : c)) }, gesture);
  };
  const setSong = (patch: Partial<MusicClip>, gesture: string) => {
    const p = projectRef.current;
    update({ ...p, music: p.music.map((m) => (m.id === selectedId ? { ...m, ...patch } : m)) }, gesture);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.key === " ") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeSelected();
    } else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) {
      split();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
  };

  // Everything the post needs: waits for the source uploads, renders, and uploads the result.
  const render = async (): Promise<{ result: { video: Blob; poster: Blob }; sources: SavedEdit["sources"] }> => {
    if (!layers) throw new Error("The preview is not ready yet.");
    player.current?.pause();
    const p = projectRef.current;
    const used = new Set([...p.clips.map((c) => c.sourceId), ...p.music.map((m) => m.sourceId)]);
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    setRendering({ fraction: 0, label: "Starting" });
    try {
      const saved: SavedEdit["sources"] = [];
      for (const id of used) {
        const source = sourcesRef.current.get(id);
        if (!source) throw new Error("A file used in the edit is missing.");
        if (source.info.url) {
          saved.push({ id, kind: source.info.kind, name: source.info.name, url: source.info.url });
          continue;
        }
        setRendering({ fraction: 0, label: `Uploading ${source.info.name}` });
        let url: string | null = null;
        try {
          url = (await uploadPromises.current.get(id)) ?? null;
        } catch {
          // The first try failed; one more before giving up.
          startUpload(source);
          try {
            url = (await uploadPromises.current.get(id)) ?? null;
          } catch (err: any) {
            throw new Error(`${source.info.name} could not be uploaded: ${err?.message || "Upload failed"}. Remove it and add it again.`);
          }
        }
        if (!url) throw new Error(`${source.info.name} did not upload. Remove it and add it again.`);
        saved.push({ id, kind: source.info.kind, name: source.info.name, url });
      }
      const run = animatedWebp ? exportAnimatedWebp : exportPostVideo;
      const result = await run({
        project: p,
        sources: sourcesRef.current,
        layers,
        signal: controller.signal,
        onProgress: (fraction, label) => setRendering({ fraction, label }),
      });
      return { result, sources: saved };
    } catch (err: any) {
      if (err?.name === "AbortError") throw new Error("Export cancelled");
      throw err;
    } finally {
      abort.current = null;
      setRendering(null);
    }
  };

  useImperativeHandle(ref, () => ({
    hasVideo: () => projectRef.current.clips.length > 0,
    prepareSave: async () => {
      const { result, sources: saved } = await render();
      setRendering({ fraction: 1, label: "Uploading the video" });
      try {
        const [videoUrl, imageUrl] = await Promise.all([
          uploadMedia(result.video, { kind: "final", name: animatedWebp ? "post.webp" : "post.mp4" }),
          uploadPoster(result.poster),
        ]);
        const edit: SavedEdit = { v: 1, sources: saved, project: projectRef.current };
        return { videoUrl, imageUrl, videoEdit: JSON.stringify(edit) };
      } finally {
        setRendering(null);
      }
    },
    downloadVideo: async (name: string) => {
      const { result } = await render();
      const url = URL.createObjectURL(result.video);
      const link = document.createElement("a");
      link.href = url;
      const ext = result.video.type === "image/webp" ? "webp" : result.video.type === "video/webm" ? "webm" : "mp4";
      link.download = `${name || "post"}.${ext}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    loadFromPost: async (post) => {
      const edit = parseSavedEdit(post.videoEdit);
      if (!edit) throw new Error("This post has no saved edit to open. Create a new video instead.");
      setError("");
      const loaded = new Map<string, LoadedSource>();
      try {
        for (const s of edit.sources) {
          setLoading(`Loading ${s.name}...`);
          const res = await fetch(s.url);
          if (!res.ok) throw new Error(`${s.name} could not be loaded (${res.status}).`);
          const blob = await res.blob();
          const source = await loadSource(blob, s.name, s.kind, s.url, s.id);
          loaded.set(s.id, source);
        }
      } catch (err) {
        loaded.forEach(disposeSource);
        throw err;
      } finally {
        setLoading("");
      }
      sourcesRef.current.forEach(disposeSource);
      uploadPromises.current.clear();
      setUploads({});
      sourcesRef.current = loaded;
      setSources(loaded);
      history.current = { past: [], future: [], gesture: "", at: 0 };
      projectRef.current = edit.project;
      setProject(edit.project);
      setSelectedId(null);
      player.current?.seek(0);
    },
    reset: () => {
      player.current?.pause();
      sourcesRef.current.forEach(disposeSource);
      uploadPromises.current.clear();
      sourcesRef.current = new Map();
      setSources(new Map());
      setUploads({});
      history.current = { past: [], future: [], gesture: "", at: 0 };
      projectRef.current = emptyProject();
      setProject(emptyProject());
      setSelectedId(null);
      setError("");
    },
  }));

  const uploading = useMemo(() => Object.values(uploads).some((u) => !u.error && u.progress < 1), [uploads]);
  const failed = useMemo(
    () => [...sources.values()].filter((s) => uploads[s.info.id]?.error).map((s) => `${s.info.name}: ${uploads[s.info.id].error}`),
    [sources, uploads]
  );

  const sliderRow = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, shown?: string) => (
    <label className="block text-[11px] text-neutral-600 dark:text-neutral-400">
      {label}
      {shown ? <span className="float-right tabular-nums">{shown}</span> : null}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );

  const timeline = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={videoInput} type="file" accept="video/*" multiple onChange={(e) => addVideos(e.target.files)} className="hidden" />
        <input ref={songInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac" onChange={(e) => addSong(e.target.files)} className="hidden" />
        <Button type="button" variant="outline" size="sm" onClick={() => videoInput.current?.click()} className="cursor-pointer">
          <Video className="h-4 w-4 mr-1.5" /> Add video
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => songInput.current?.click()} className="cursor-pointer">
          <Music className="h-4 w-4 mr-1.5" /> Add song
        </Button>
        {loading && (
          <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {loading}
          </span>
        )}
        {uploading && !loading && (
          <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
            <Upload className="h-3.5 w-3.5" /> Uploading files in the background...
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={togglePlay} disabled={total <= 0} className="cursor-pointer" aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <span className="text-xs tabular-nums text-neutral-600 dark:text-neutral-400">
          {fmt(time)} / {fmt(total)} <span className="text-neutral-400">(max {MAX_DURATION}s)</span>
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={split} disabled={total <= 0} className="cursor-pointer" title="Split at the playhead (S)">
            <Scissors className="h-4 w-4 mr-1" /> Split
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={removeSelected} disabled={!selectedId} className="cursor-pointer" title="Delete the selected clip (Delete)">
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={undo} className="cursor-pointer" aria-label="Undo" title="Undo (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={redo} className="cursor-pointer" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <VideoTimeline
        project={project}
        sources={sources}
        time={time}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onSeek={seek}
        onChange={update}
      />

      {selectedClip && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
          <p className={labelClass}>Selected clip</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-3">
            {sliderRow("Volume", selectedClip.volume, 0, 1, 0.05, (v) => setClip({ volume: v }, "volume"), `${Math.round(selectedClip.volume * 100)}%`)}
            {sliderRow("Zoom", selectedClip.zoom, 1, 3, 0.05, (v) => setClip({ zoom: v }, "zoom"), `${selectedClip.zoom.toFixed(2)}x`)}
            {sliderRow("Left / right", selectedClip.focusX, 0, 1, 0.01, (v) => setClip({ focusX: v }, "fx"))}
            {sliderRow("Up / down", selectedClip.focusY, 0, 1, 0.01, (v) => setClip({ focusY: v }, "fy"))}
          </div>
          {project.clips.length > 1 && (
            <button
              type="button"
              className="text-[11px] text-blue-600 dark:text-blue-400 underline cursor-pointer"
              onClick={() => setClip({ zoom: selectedClip.zoom, focusX: selectedClip.focusX, focusY: selectedClip.focusY }, "", true)}
            >
              Use this framing for every clip
            </button>
          )}
        </div>
      )}

      {selectedMusic && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
          <p className={labelClass}>Selected song</p>
          <div className="grid grid-cols-3 gap-3">
            {sliderRow("Volume", selectedMusic.volume, 0, 1, 0.05, (v) => setSong({ volume: v }, "volume"), `${Math.round(selectedMusic.volume * 100)}%`)}
            {sliderRow("Fade in", selectedMusic.fadeIn, 0, 5, 0.1, (v) => setSong({ fadeIn: v }, "fadeIn"), `${selectedMusic.fadeIn.toFixed(1)}s`)}
            {sliderRow("Fade out", selectedMusic.fadeOut, 0, 5, 0.1, (v) => setSong({ fadeOut: v }, "fadeOut"), `${selectedMusic.fadeOut.toFixed(1)}s`)}
          </div>
        </div>
      )}

      <p className="text-[11px] text-neutral-500">
        Drag the edges of a clip to trim it, drag a clip to reorder it, click the ruler to move the playhead. The video is saved at up to {Math.round(MAX_VIDEO_BYTES / 1048576)} MB, the most Discord accepts.
      </p>

      {failed.map((f) => (
        <p key={f} className="text-[11px] text-red-600">{f}</p>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {rendering && (
        <div className="rounded-lg border border-blue-300 dark:border-blue-900 p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {rendering.label}</span>
            <span className="tabular-nums">{Math.round(rendering.fraction * 100)}%</span>
          </div>
          <div className="h-1.5 rounded bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${Math.round(rendering.fraction * 100)}%` }} />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => abort.current?.abort()} className="cursor-pointer">
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-3 outline-none" tabIndex={0} onKeyDown={timelineHost ? undefined : onKeyDown}>
      {timelineHost ? createPortal(<div className="space-y-3 outline-none" tabIndex={0} onKeyDown={onKeyDown}>{timeline}</div>, timelineHost) : timeline}
    </div>
  );
});

