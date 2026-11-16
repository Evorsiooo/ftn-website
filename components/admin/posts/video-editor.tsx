"use client";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Minus, Music, Pause, Play, Plus, Redo2, Scissors, SkipBack, SkipForward, Trash2, Undo2, Upload, Video, X } from "lucide-react";
import type { PostLayers } from "@/lib/post-template";
import { exportPostVideo } from "@/lib/post-video/export";
import { exportAnimatedWebp } from "@/lib/post-video/webp";
import { MAX_DURATION, MIN_CLIP, clipAt, clipLength, emptyProject, newId, parseSavedEdit, projectDuration, type MusicClip, type Project, type SavedEdit, type VideoClip } from "@/lib/post-video/model";
import { detectFraming } from "@/lib/post-video/autofit";
import { PreviewPlayer } from "@/lib/post-video/preview";
import { disposeSource, loadSource, type LoadedSource } from "@/lib/post-video/sources";
import { uploadMedia } from "@/lib/post-video/upload";
import { makeFilmstrip, makeWaveform, type Filmstrip, type Waveform } from "@/lib/post-video/strip";
import { VideoTimeline } from "./video-timeline";

const labelClass = "lbl block";
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
  /** Where the editing dock (transport, timeline and clip panel) goes, under the preview. Without it, it stays in place. */
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
  const [strips, setStrips] = useState<Map<string, Filmstrip>>(new Map());
  const [waves, setWaves] = useState<Map<string, Waveform>>(new Map());
  // Phones start zoomed in, so a clip is wide enough to grab.
  const [zoom, setZoom] = useState(() => (typeof window !== "undefined" && window.innerWidth < 761 ? 2.5 : 1));

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
    [],
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
      },
    );
    promise.catch(() => {});
    uploadPromises.current.set(id, promise);
  };

  // Frames for the Video track and the sound shape for the Music track, worked out in the background.
  const analyse = (source: LoadedSource) => {
    const id = source.info.id;
    if (source.info.kind === "video") {
      makeFilmstrip(source)
        .then((strip) => strip && setStrips((m) => new Map(m).set(id, strip)))
        .catch(() => {});
    } else {
      makeWaveform(source)
        .then((wave) => wave && setWaves((m) => new Map(m).set(id, wave)))
        .catch(() => {});
    }
  };

  const addVideos = async (files: FileList | File[] | null) => {
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
        analyse(source);
      } catch (err: any) {
        setError(`${file.name}: ${err?.message || "Could not read this file."}`);
      }
    }
    setLoading("");
    if (videoInput.current) videoInput.current.value = "";
  };

  const addSong = async (files: FileList | File[] | null) => {
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
      analyse(source);
    } catch (err: any) {
      setError(`${file.name}: ${err?.message || "Could not read this file."}`);
    }
    setLoading("");
    if (songInput.current) songInput.current.value = "";
  };

  // Files dropped on a track: videos go on the Video track, sound files on the Music track.
  const dropFiles = (lane: "video" | "music", list: FileList) => {
    const files = Array.from(list);
    const videos = files.filter((f) => f.type.startsWith("video/"));
    const songs = files.filter((f) => f.type.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|flac)$/i.test(f.name));
    if (lane === "music" && songs.length) return addSong([songs[0]]);
    if (videos.length) return addVideos(videos);
    if (songs.length) return addSong([songs[0]]);
    setError("Drop a video file (MP4, MOV, WebM) or a sound file (MP3, M4A, WAV).");
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
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      seek(Math.min(Math.max(0, (player.current?.time ?? time) + dir * (e.shiftKey ? 1 : 1 / 30)), total));
    } else if (e.key === "Home") {
      e.preventDefault();
      seek(0);
    } else if (e.key === "End") {
      e.preventDefault();
      seek(total);
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
        const [videoUrl, imageUrl] = await Promise.all([uploadMedia(result.video, { kind: "final", name: animatedWebp ? "post.webp" : "post.mp4" }), uploadPoster(result.poster)]);
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
      setStrips(new Map());
      setWaves(new Map());
      loaded.forEach(analyse);
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
      setStrips(new Map());
      setWaves(new Map());
      setUploads({});
      history.current = { past: [], future: [], gesture: "", at: 0 };
      projectRef.current = emptyProject();
      setProject(emptyProject());
      setSelectedId(null);
      setError("");
    },
  }));

  const uploading = useMemo(() => Object.values(uploads).some((u) => !u.error && u.progress < 1), [uploads]);
  const failed = useMemo(() => [...sources.values()].filter((s) => uploads[s.info.id]?.error).map((s) => `${s.info.name}: ${uploads[s.info.id].error}`), [sources, uploads]);

  const slider = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, shown: string) => (
    <label className="vi-slider">
      <span className="vi-sl-top">
        <span>{label}</span>
        <span className="num muted">{shown}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="range" />
    </label>
  );

  const selectedSource = selectedClip ? sources.get(selectedClip.sourceId) : selectedMusic ? sources.get(selectedMusic.sourceId) : undefined;
  const selectedFrame = selectedClip ? strips.get(selectedClip.sourceId)?.frames[0] : undefined;
  const clipIndex = selectedClip ? project.clips.findIndex((c) => c.id === selectedClip.id) : -1;

  // The panel beside the timeline: settings of the selected clip or song, or a summary and the shortcuts.
  const inspector = (
    <div className="vi">
      {selectedClip ? (
        <>
          <div className="vi-head">
            <span className="vi-thumb" style={selectedFrame ? { backgroundImage: `url(${selectedFrame})` } : undefined} />
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="trunc vi-title">
                Clip {clipIndex + 1} · {selectedSource?.info.name ?? "Missing file"}
              </span>
              <span className="t12 muted num">
                {clipLength(selectedClip).toFixed(1)}s, from {fmt(selectedClip.start)} of {fmt(selectedSource?.info.duration ?? 0)}
              </span>
            </span>
          </div>
          {slider("Sound", selectedClip.volume, 0, 1, 0.05, (v) => setClip({ volume: v }, "volume"), selectedSource?.info.hasAudio ? `${Math.round(selectedClip.volume * 100)}%` : "No sound")}
          {slider("Zoom", selectedClip.zoom, 1, 3, 0.05, (v) => setClip({ zoom: v }, "zoom"), `${selectedClip.zoom.toFixed(2)}x`)}
          {slider("Left / right", selectedClip.focusX, 0, 1, 0.01, (v) => setClip({ focusX: v }, "fx"), `${Math.round(selectedClip.focusX * 100)}%`)}
          {slider("Up / down", selectedClip.focusY, 0, 1, 0.01, (v) => setClip({ focusY: v }, "fy"), `${Math.round(selectedClip.focusY * 100)}%`)}
          <div className="vi-actions">
            <button type="button" className="btn sm" onClick={() => setClip({ zoom: 1, focusX: 0.5, focusY: 0.5 }, "")}>
              Reset framing
            </button>
            {project.clips.length > 1 && (
              <button type="button" className="btn sm" onClick={() => setClip({ zoom: selectedClip.zoom, focusX: selectedClip.focusX, focusY: selectedClip.focusY }, "", true)}>
                Use on every clip
              </button>
            )}
          </div>
        </>
      ) : selectedMusic ? (
        <>
          <div className="vi-head">
            <span className="vi-thumb song">
              <Music className="ic" />
            </span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="trunc vi-title">{selectedSource?.info.name ?? "Missing file"}</span>
              <span className="t12 muted num">
                {(selectedMusic.end - selectedMusic.start).toFixed(1)}s, plays from {fmt(selectedMusic.at)}
              </span>
            </span>
          </div>
          {slider("Volume", selectedMusic.volume, 0, 1, 0.05, (v) => setSong({ volume: v }, "volume"), `${Math.round(selectedMusic.volume * 100)}%`)}
          {slider("Fade in", selectedMusic.fadeIn, 0, 5, 0.1, (v) => setSong({ fadeIn: v }, "fadeIn"), `${selectedMusic.fadeIn.toFixed(1)}s`)}
          {slider("Fade out", selectedMusic.fadeOut, 0, 5, 0.1, (v) => setSong({ fadeOut: v }, "fadeOut"), `${selectedMusic.fadeOut.toFixed(1)}s`)}
          <div className="vi-actions">
            <button
              type="button"
              className="btn sm"
              onClick={() => setSong({ at: 0 }, "")}
              disabled={selectedMusic.at === 0 || project.music.some((m) => m.id !== selectedMusic.id && m.at < selectedMusic.at)}
            >
              Start with the video
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="vi-title">{project.clips.length === 0 ? "Start with a video" : "Your video"}</div>
          <p className="t12 muted" style={{ margin: 0 }}>
            {project.clips.length === 0
              ? `Add one or more videos: they play one after the other, up to ${MAX_DURATION} seconds. Then add a song if you want music under it.`
              : `${project.clips.length} ${project.clips.length === 1 ? "clip" : "clips"}${project.music.length ? `, ${project.music.length} ${project.music.length === 1 ? "song" : "songs"}` : ""}, ${total.toFixed(1)} of ${MAX_DURATION} seconds. Click a clip or a song to change it.`}
          </p>
          <dl className="vi-keys">
            <dt>Space</dt>
            <dd>Play or pause</dd>
            <dt>S</dt>
            <dd>Split at the playhead</dd>
            <dt>← →</dt>
            <dd>One frame (Shift: one second)</dd>
            <dt>Delete</dt>
            <dd>Remove the selected clip</dd>
            <dt>Ctrl Z</dt>
            <dd>Undo (Shift to redo)</dd>
          </dl>
        </>
      )}
    </div>
  );

  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;

  const dock = (
    <div className="vdock" tabIndex={0} onKeyDown={onKeyDown}>
      <input ref={videoInput} type="file" accept="video/*" multiple onChange={(e) => addVideos(e.target.files)} className="hidden" />
      <input ref={songInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac" onChange={(e) => addSong(e.target.files)} className="hidden" />

      <div className="vbar">
        <div className="vbar-l">
          <button type="button" className="btn sm hide-m" onClick={() => videoInput.current?.click()}>
            <Video className="ic" /> Add video
          </button>
          <button type="button" className="btn sm hide-m" onClick={() => songInput.current?.click()}>
            <Music className="ic" /> Add song
          </button>
        </div>
        <div className="vbar-c">
          <button type="button" className="iconbtn" onClick={() => seek(0)} disabled={total <= 0} aria-label="Go to the start" title="Go to the start (Home)">
            <SkipBack className="ic" />
          </button>
          <button type="button" className="vplay" onClick={togglePlay} disabled={total <= 0} aria-label={playing ? "Pause" : "Play"} title="Play or pause (Space)">
            {playing ? <Pause className="ic" /> : <Play className="ic" />}
          </button>
          <button type="button" className="iconbtn" onClick={() => seek(total)} disabled={total <= 0} aria-label="Go to the end" title="Go to the end (End)">
            <SkipForward className="ic" />
          </button>
          <span className="vtime num">
            {fmt(time)} <span className="faint">/ {fmt(total)}</span>
          </span>
        </div>
        <div className="vbar-r">
          <button type="button" className="iconbtn" onClick={split} disabled={total <= 0} aria-label="Split" title="Split at the playhead (S)">
            <Scissors className="ic" />
          </button>
          <button type="button" className="iconbtn" onClick={removeSelected} disabled={!selectedId} aria-label="Delete" title="Delete the selected clip (Delete)">
            <Trash2 className="ic" />
          </button>
          <span className="vsep" />
          <button type="button" className="iconbtn" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
            <Undo2 className="ic" />
          </button>
          <button type="button" className="iconbtn" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="ic" />
          </button>
          <span className="vsep hide-m" />
          <span className="vzoom">
            <button type="button" className="iconbtn sm" onClick={() => setZoom((z) => Math.max(1, z / 1.5))} disabled={zoom <= 1} aria-label="Zoom out">
              <Minus className="ic" />
            </button>
            <input type="range" min={1} max={6} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="range" aria-label="Timeline zoom" />
            <button type="button" className="iconbtn sm" onClick={() => setZoom((z) => Math.min(6, z * 1.5))} disabled={zoom >= 6} aria-label="Zoom in">
              <Plus className="ic" />
            </button>
          </span>
        </div>
      </div>

      {(loading || uploading || error || failed.length > 0 || rendering) && (
        <div className="vstatus">
          {loading && (
            <span className="help inline-flex items-center gap-1">
              <Loader2 className="ic spin" /> {loading}
            </span>
          )}
          {uploading && !loading && (
            <span className="help inline-flex items-center gap-1">
              <Upload className="ic" /> Uploading files in the background…
            </span>
          )}
          {failed.map((f) => (
            <span key={f} className="err">
              {f}
            </span>
          ))}
          {error && <span className="err">{error}</span>}
          {rendering && (
            <span className="vrender">
              <Loader2 className="ic spin" />
              <span className="trunc">{rendering.label}</span>
              <span className="meter" style={{ width: 160 }}>
                <i style={{ width: `${Math.round(rendering.fraction * 100)}%` }} />
              </span>
              <span className="num t12">{Math.round(rendering.fraction * 100)}%</span>
              <button type="button" className="btn sm" onClick={() => abort.current?.abort()}>
                <X className="ic" /> Cancel
              </button>
            </span>
          )}
        </div>
      )}

      <div className="vdock-main">
        <VideoTimeline
          project={project}
          sources={sources}
          strips={strips}
          waves={waves}
          time={time}
          playing={playing}
          zoom={zoom}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSeek={seek}
          onChange={update}
          onAddVideo={() => videoInput.current?.click()}
          onAddSong={() => songInput.current?.click()}
          onDropFiles={dropFiles}
        />
        {inspector}
      </div>
    </div>
  );

  return timelineHost ? createPortal(dock, timelineHost) : dock;
});
