"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Music, Plus, Video } from "lucide-react";
import { MAX_DURATION, MIN_CLIP, clipLength, clipStarts, projectDuration, type MusicClip, type Project, type VideoClip } from "@/lib/post-video/model";
import type { LoadedSource } from "@/lib/post-video/sources";
import type { Filmstrip, Waveform } from "@/lib/post-video/strip";
import { cn } from "@/lib/utils";

// The video timeline: a ruler, a Video track with frames from each clip and a Music track with the
// shape of each song, a playhead you can drag, and the 30 second limit shown on the ruler.
// Clips are dragged to reorder and trimmed by their edges; songs are dragged along the track and
// snap to cuts and to the playhead.

const SNAP_PX = 8;
const TILE_W = 64;

type Drag =
  | { kind: "seek" }
  | { kind: "trim"; lane: "video" | "music"; side: "left" | "right"; id: string; startX: number; orig: VideoClip | MusicClip }
  | { kind: "reorder"; id: string; startX: number; moved: boolean }
  | { kind: "move"; id: string; startX: number; origAt: number };

interface Props {
  project: Project;
  sources: Map<string, LoadedSource>;
  strips: Map<string, Filmstrip>;
  waves: Map<string, Waveform>;
  time: number;
  playing: boolean;
  zoom: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSeek: (t: number) => void;
  /** `gesture` names a continuous edit (a drag), so the parent can fold it into one undo step. */
  onChange: (project: Project, gesture?: string) => void;
  onAddVideo: () => void;
  onAddSong: () => void;
  onDropFiles: (lane: "video" | "music", files: FileList) => void;
}

const label = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** The loudness of the part of a song that plays, drawn as bars. */
function Wave({ wave, from, to, width, fadeIn, fadeOut }: { wave: Waveform | undefined; from: number; to: number; width: number; fadeIn: number; fadeOut: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const h = canvas.clientHeight || 32;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, h);
    ctx.fillStyle = getComputedStyle(canvas).color;
    const length = to - from;
    for (let x = 0; x < width; x += 3) {
      const t = from + (x / width) * length;
      let v = 0.15;
      if (wave) {
        const i = Math.floor(t * wave.rate);
        const j = Math.max(i + 1, Math.floor((from + ((x + 3) / width) * length) * wave.rate));
        v = 0;
        for (let k = i; k < j && k < wave.peaks.length; k++) v = Math.max(v, wave.peaks[k]);
      }
      // The fades make the song quieter at its ends.
      const local = t - from;
      let gain = 1;
      if (fadeIn > 0 && local < fadeIn) gain = local / fadeIn;
      if (fadeOut > 0 && length - local < fadeOut) gain = Math.min(gain, (length - local) / fadeOut);
      const bar = Math.max(1.5, v * gain * (h - 4));
      ctx.fillRect(x, (h - bar) / 2, 2, bar);
    }
  }, [wave, from, to, width, fadeIn, fadeOut]);
  return <canvas ref={ref} className="tl-wave" style={{ width }} aria-hidden />;
}

export function VideoTimeline({ project, sources, strips, waves, time, playing, zoom, selectedId, onSelect, onSeek, onChange, onAddVideo, onAddSong, onDropFiles }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(800);
  const [reorder, setReorder] = useState<{ id: string; dx: number; target: number } | null>(null);
  const [dropLane, setDropLane] = useState<"video" | "music" | null>(null);
  const drag = useRef<Drag | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewW(el.clientWidth || 800));
    observer.observe(el);
    setViewW(el.clientWidth || 800);
    return () => observer.disconnect();
  }, []);

  const total = projectDuration(project);
  const span = MAX_DURATION + 3;
  const pps = ((viewW - 10) / span) * zoom;
  const contentW = Math.max(viewW - 10, span * pps);
  const starts = clipStarts(project.clips);
  const nameOf = (sourceId: string) => sources.get(sourceId)?.info.name ?? "Missing file";
  const durationOf = (sourceId: string) => sources.get(sourceId)?.info.duration ?? 0;

  // While playing zoomed in, the view follows the playhead.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = time * pps;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - 40);
  }, [time, pps, playing]);

  const timeAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(Math.max(0, (clientX - rect.left) / pps), total);
  };

  /** Moves `t` onto a cut, the end of the video or the playhead when it is within a few pixels. */
  const snap = (t: number) => {
    const marks = [0, total, time, ...starts, ...project.music.flatMap((m) => [m.at, m.at + (m.end - m.start)])];
    let best = t;
    let bestPx = SNAP_PX;
    for (const m of marks) {
      const px = Math.abs(m - t) * pps;
      if (px < bestPx) {
        best = m;
        bestPx = px;
      }
    }
    return best;
  };

  const replaceClip = (clip: VideoClip, gesture = "trim") => onChange({ ...project, clips: project.clips.map((c) => (c.id === clip.id ? clip : c)) }, gesture);
  const replaceMusic = (m: MusicClip, gesture = "trim") => onChange({ ...project, music: project.music.map((x) => (x.id === m.id ? m : x)) }, gesture);

  const begin = (e: React.PointerEvent, next: Drag) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = next;
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "seek") return onSeek(timeAt(e.clientX));
    const dt = (e.clientX - d.startX) / pps;

    if (d.kind === "trim" && d.lane === "video") {
      const orig = d.orig as VideoClip;
      const maxEnd = durationOf(orig.sourceId);
      const otherTotal = total - clipLength(orig);
      if (d.side === "left") {
        const start = Math.min(Math.max(0, orig.start + dt), orig.end - MIN_CLIP);
        const grow = Math.min(0, start - orig.start); // negative: the clip gets longer
        const room = MAX_DURATION - otherTotal - clipLength(orig);
        const limited = -grow > room ? orig.start - room : start;
        replaceClip({ ...orig, start: Math.max(0, limited) });
      } else {
        let end = Math.min(Math.max(orig.start + MIN_CLIP, orig.end + dt), maxEnd);
        end = Math.min(end, orig.start + (MAX_DURATION - otherTotal));
        replaceClip({ ...orig, end });
      }
    } else if (d.kind === "trim") {
      const orig = d.orig as MusicClip;
      const maxEnd = durationOf(orig.sourceId);
      const others = project.music.filter((m) => m.id !== orig.id);
      const prevEnd = Math.max(0, ...others.filter((m) => m.at < orig.at).map((m) => m.at + (m.end - m.start)));
      const nextAt = Math.min(Infinity, ...others.filter((m) => m.at >= orig.at + (orig.end - orig.start) - 1e-6).map((m) => m.at));
      if (d.side === "left") {
        // The left edge follows the pointer and the sound stays where it is on the timeline.
        let shift = snap(orig.at + dt) - orig.at;
        shift = Math.min(shift, orig.end - MIN_CLIP - orig.start);
        shift = Math.max(shift, -orig.start, prevEnd - orig.at);
        replaceMusic({ ...orig, start: orig.start + shift, at: orig.at + shift });
      } else {
        const edge = snap(orig.at + (orig.end - orig.start) + dt);
        let end = Math.min(Math.max(orig.start + MIN_CLIP, orig.start + (edge - orig.at)), maxEnd);
        end = Math.min(end, orig.start + (nextAt - orig.at));
        replaceMusic({ ...orig, end });
      }
    } else if (d.kind === "move") {
      const m = project.music.find((x) => x.id === d.id);
      if (!m) return;
      const length = m.end - m.start;
      const others = project.music.filter((x) => x.id !== m.id);
      const lo = Math.max(0, ...others.filter((x) => x.at < d.origAt).map((x) => x.at + (x.end - x.start)));
      const hi = Math.min(Math.max(0, total - MIN_CLIP), ...others.filter((x) => x.at > d.origAt).map((x) => x.at - length));
      let at = d.origAt + dt;
      const snapStart = snap(at);
      const snapEnd = snap(at + length) - length;
      at = Math.abs(snapStart - at) <= Math.abs(snapEnd - at) ? snapStart : snapEnd;
      replaceMusic({ ...m, at: Math.min(Math.max(lo, at), Math.max(lo, hi)) }, "move");
    } else if (d.kind === "reorder") {
      const dx = e.clientX - d.startX;
      if (Math.abs(dx) > 3) d.moved = true;
      const index = project.clips.findIndex((c) => c.id === d.id);
      const clip = project.clips[index];
      const center = starts[index] * pps + (clipLength(clip) * pps) / 2 + dx;
      let target = 0;
      project.clips.forEach((c, i) => {
        if (i !== index && starts[i] * pps + (clipLength(c) * pps) / 2 < center) target++;
      });
      setReorder({ id: d.id, dx, target });
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "reorder") {
      if (reorder && d.moved) {
        const index = project.clips.findIndex((c) => c.id === d.id);
        if (index !== reorder.target) {
          const clips = [...project.clips];
          const [clip] = clips.splice(index, 1);
          clips.splice(reorder.target, 0, clip);
          onChange({ ...project, clips });
        }
      }
      setReorder(null);
    }
  };

  // Ruler marks: a labelled mark every few seconds, small ones between.
  let step = 1;
  while (pps * step < 56) step = step === 1 ? 2 : step === 2 ? 5 : step * 2;
  const minor = step >= 5 ? step / 5 : step / 2;
  const marks: { t: number; major: boolean }[] = [];
  for (let t = 0; t <= MAX_DURATION + 1e-6; t += minor) marks.push({ t, major: t < MAX_DURATION - 1e-6 && Math.abs(t / step - Math.round(t / step)) < 1e-6 });

  const dropProps = (lane: "video" | "music") => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDropLane(lane);
    },
    onDragLeave: () => setDropLane(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropLane(null);
      if (e.dataTransfer.files.length) onDropFiles(lane, e.dataTransfer.files);
    },
  });

  // Pressing an empty part of a track deselects and moves the playhead there.
  const laneDown = (e: React.PointerEvent) => {
    onSelect(null);
    begin(e, { kind: "seek" });
    onSeek(timeAt(e.clientX));
  };

  const handles = (lane: "video" | "music", item: VideoClip | MusicClip) => (
    <>
      <span
        className="tl-handle l"
        onPointerDown={(e) => {
          onSelect(item.id);
          begin(e, { kind: "trim", lane, side: "left", id: item.id, startX: e.clientX, orig: item });
        }}
        aria-hidden
      />
      <span
        className="tl-handle r"
        onPointerDown={(e) => {
          onSelect(item.id);
          begin(e, { kind: "trim", lane, side: "right", id: item.id, startX: e.clientX, orig: item });
        }}
        aria-hidden
      />
    </>
  );

  return (
    <div className="tl" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div className="tl-heads">
        <div className="tl-corner" />
        <div className="tl-head">
          <Video className="ic" />
          <span className="grow">Video</span>
          <button type="button" className="iconbtn sm" onClick={onAddVideo} aria-label="Add video" title="Add video">
            <Plus className="ic" />
          </button>
        </div>
        <div className="tl-head">
          <Music className="ic" />
          <span className="grow">Music</span>
          <button type="button" className="iconbtn sm" onClick={onAddSong} aria-label="Add song" title="Add song">
            <Plus className="ic" />
          </button>
        </div>
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-content" ref={trackRef} style={{ width: contentW }}>
          <div
            className="tl-ruler"
            onPointerDown={(e) => {
              begin(e, { kind: "seek" });
              onSeek(timeAt(e.clientX));
            }}
          >
            {marks.map((m) => (
              <span key={m.t} className={cn("tl-mark", m.major && "major")} style={{ left: m.t * pps }}>
                {m.major && <span className="tl-lbl">{label(m.t)}</span>}
              </span>
            ))}
            <span className="tl-limit" style={{ left: MAX_DURATION * pps }} title={`Posts are at most ${MAX_DURATION} seconds`}>
              <span className="tl-lbl">{MAX_DURATION}s max</span>
            </span>
          </div>

          <div className={cn("tl-lane", dropLane === "video" && "drop")} onPointerDown={laneDown} {...dropProps("video")}>
            <div className="tl-over" style={{ left: MAX_DURATION * pps }} />
            {project.clips.map((c, i) => {
              const selected = selectedId === c.id;
              const moving = reorder?.id === c.id;
              const width = Math.max(6, clipLength(c) * pps - 2);
              const strip = strips.get(c.sourceId);
              const tiles = Math.ceil(width / TILE_W);
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Clip ${i + 1}, ${nameOf(c.sourceId)}`}
                  className={cn("tl-clip vid", selected && "sel", moving && "moving")}
                  style={{ left: starts[i] * pps + (moving ? reorder!.dx : 0), width }}
                  onPointerDown={(e) => {
                    onSelect(c.id);
                    begin(e, { kind: "reorder", id: c.id, startX: e.clientX, moved: false });
                  }}
                >
                  <span className="tl-film" aria-hidden>
                    {Array.from({ length: tiles }, (_, k) => {
                      const t = c.start + (k * TILE_W + TILE_W / 2) / pps;
                      const src = strip ? strip.frames[Math.min(strip.frames.length - 1, Math.max(0, Math.floor(t / strip.step)))] : "";
                      return <span key={k} className="tl-tile" style={{ left: k * TILE_W, backgroundImage: src ? `url(${src})` : undefined }} />;
                    })}
                  </span>
                  <span className="tl-tag">
                    {nameOf(c.sourceId)} · {clipLength(c).toFixed(1)}s
                  </span>
                  {handles("video", c)}
                </div>
              );
            })}
            {reorder && (
              <div
                className="tl-insert"
                style={{
                  left:
                    project.clips
                      .filter((c) => c.id !== reorder.id)
                      .slice(0, reorder.target)
                      .reduce((at, c) => at + clipLength(c), 0) *
                      pps -
                    1,
                }}
              />
            )}
            {project.clips.length === 0 && (
              <button type="button" className="tl-empty" onPointerDown={(e) => e.stopPropagation()} onClick={onAddVideo}>
                <Plus className="ic" /> Add a video, or drop one here
              </button>
            )}
          </div>

          <div className={cn("tl-lane music", dropLane === "music" && "drop")} onPointerDown={laneDown} {...dropProps("music")}>
            <div className="tl-over" style={{ left: MAX_DURATION * pps }} />
            {total > 0 && <div className="tl-end" style={{ left: total * pps }} title="The video ends here" />}
            {project.music.map((m) => {
              const selected = selectedId === m.id;
              const width = Math.max(6, (m.end - m.start) * pps - 2);
              return (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Song ${nameOf(m.sourceId)}`}
                  className={cn("tl-clip song", selected && "sel")}
                  style={{ left: m.at * pps, width }}
                  onPointerDown={(e) => {
                    onSelect(m.id);
                    begin(e, { kind: "move", id: m.id, startX: e.clientX, origAt: m.at });
                  }}
                >
                  <Wave wave={waves.get(m.sourceId)} from={m.start} to={m.end} width={width} fadeIn={m.fadeIn} fadeOut={m.fadeOut} />
                  <span className="tl-tag">{nameOf(m.sourceId)}</span>
                  {handles("music", m)}
                </div>
              );
            })}
            {project.music.length === 0 && (
              <button type="button" className="tl-empty" onPointerDown={(e) => e.stopPropagation()} onClick={onAddSong}>
                <Plus className="ic" /> Add a song, or drop one here
              </button>
            )}
          </div>

          <div className="tl-playhead" style={{ left: time * pps }}>
            <span
              className="tl-knob"
              onPointerDown={(e) => begin(e, { kind: "seek" })}
              role="slider"
              aria-label="Playhead"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={Number(time.toFixed(1))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
