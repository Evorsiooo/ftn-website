"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  MAX_DURATION,
  MIN_CLIP,
  clipLength,
  clipStarts,
  projectDuration,
  type MusicClip,
  type Project,
  type VideoClip,
} from "@/lib/post-video/model";
import type { LoadedSource } from "@/lib/post-video/sources";

const CLIP_COLORS = ["#3b78d8", "#2a9d8f", "#8a63d2", "#c9712d", "#b5497a", "#5f8f3a"];
const HANDLE = 8;

type Drag =
  | { kind: "seek" }
  | { kind: "trim"; lane: "video" | "music"; side: "left" | "right"; id: string; startX: number; orig: VideoClip | MusicClip }
  | { kind: "reorder"; id: string; startX: number; moved: boolean }
  | { kind: "move"; id: string; startX: number; origAt: number };

interface Props {
  project: Project;
  sources: Map<string, LoadedSource>;
  time: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSeek: (t: number) => void;
  /** `gesture` names a continuous edit (a drag), so the parent can fold it into one undo step. */
  onChange: (project: Project, gesture?: string) => void;
}

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export function VideoTimeline({ project, sources, time, selectedId, onSelect, onSeek, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [dragDx, setDragDx] = useState<{ id: string; dx: number; target: number } | null>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth || 600));
    observer.observe(el);
    setWidth(el.clientWidth || 600);
    return () => observer.disconnect();
  }, []);

  const total = projectDuration(project);
  const span = Math.max(10, total);
  const pps = width / span;
  const starts = clipStarts(project.clips);
  const colorOf = (sourceId: string) => {
    const index = [...sources.keys()].indexOf(sourceId);
    return CLIP_COLORS[(index < 0 ? 0 : index) % CLIP_COLORS.length];
  };
  const nameOf = (sourceId: string) => sources.get(sourceId)?.info.name ?? "Missing file";
  const durationOf = (sourceId: string) => sources.get(sourceId)?.info.duration ?? 0;

  const timeAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(Math.max(0, (clientX - rect.left) / pps), total);
  };

  const replaceClip = (clip: VideoClip, gesture = "trim") =>
    onChange({ ...project, clips: project.clips.map((c) => (c.id === clip.id ? clip : c)) }, gesture);
  const replaceMusic = (m: MusicClip, gesture = "trim") =>
    onChange({ ...project, music: project.music.map((x) => (x.id === m.id ? m : x)) }, gesture);

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
        const grow = Math.min(0, start - orig.start); // negative: clip gets longer
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
        let shift = Math.min(dt, orig.end - MIN_CLIP - orig.start);
        shift = Math.max(shift, -orig.start, prevEnd - orig.at);
        replaceMusic({ ...orig, start: orig.start + shift, at: orig.at + shift });
      } else {
        let end = Math.min(Math.max(orig.start + MIN_CLIP, orig.end + dt), maxEnd);
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
      replaceMusic({ ...m, at: Math.min(Math.max(lo, d.origAt + dt), Math.max(lo, hi)) }, "move");
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
      setDragDx({ id: d.id, dx, target });
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "reorder") {
      if (dragDx && d.moved) {
        const index = project.clips.findIndex((c) => c.id === d.id);
        if (index !== dragDx.target) {
          const clips = [...project.clips];
          const [clip] = clips.splice(index, 1);
          clips.splice(dragDx.target, 0, clip);
          onChange({ ...project, clips });
        }
      }
      setDragDx(null);
    }
  };

  const ticks: number[] = [];
  let step = span > 20 ? 5 : span > 10 ? 2 : 1;
  while (pps * step < 44 && step < span) step *= 2;
  for (let t = 0; t <= span + 1e-6; t += step) ticks.push(t);

  const laneClass = "relative h-12 rounded-md bg-neutral-100 dark:bg-neutral-900 overflow-hidden";
  const handleClass = "absolute top-0 bottom-0 cursor-ew-resize bg-white/40 hover:bg-white/70";

  return (
    <div
      className="select-none touch-none"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="grid grid-cols-[56px_1fr] gap-x-2">
        <div className="flex flex-col gap-1.5 pt-[30px] text-xs font-semibold text-neutral-500">
          <span className="h-12 flex items-center">Video</span>
          <span className="h-12 flex items-center">Music</span>
        </div>
        <div ref={trackRef} className="relative flex flex-col gap-1.5">
        <div
          className="relative h-6 cursor-pointer text-xs text-neutral-500"
          onPointerDown={(e) => {
            begin(e, { kind: "seek" });
            onSeek(timeAt(e.clientX));
          }}
        >
          {ticks.map((t) => (
            <span key={t} className="absolute top-0 -translate-x-1/2" style={{ left: t * pps }}>
              {fmt(t)}
            </span>
          ))}
        </div>

        <div className={laneClass} onPointerDown={() => onSelect(null)}>
          {project.clips.map((c, i) => {
            const selected = selectedId === c.id;
            const dragging = dragDx?.id === c.id;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                aria-label={`Clip ${i + 1}, ${nameOf(c.sourceId)}`}
                className={`absolute top-1 bottom-1 rounded px-2 py-1 text-[11px] text-white overflow-hidden whitespace-nowrap cursor-grab ${
                  selected ? "ring-2 ring-white outline outline-2 outline-blue-500" : ""
                } ${dragging ? "opacity-80 z-10 shadow-lg" : ""}`}
                style={{
                  left: starts[i] * pps + (dragging ? dragDx!.dx : 0),
                  width: Math.max(4, clipLength(c) * pps - 2),
                  background: colorOf(c.sourceId),
                }}
                onPointerDown={(e) => {
                  onSelect(c.id);
                  begin(e, { kind: "reorder", id: c.id, startX: e.clientX, moved: false });
                }}
              >
                <span className="pointer-events-none">
                  {nameOf(c.sourceId)} · {clipLength(c).toFixed(1)}s
                </span>
                <span
                  className={`${handleClass} left-0 rounded-l`}
                  style={{ width: HANDLE }}
                  onPointerDown={(e) => {
                    onSelect(c.id);
                    begin(e, { kind: "trim", lane: "video", side: "left", id: c.id, startX: e.clientX, orig: c });
                  }}
                />
                <span
                  className={`${handleClass} right-0 rounded-r`}
                  style={{ width: HANDLE }}
                  onPointerDown={(e) => {
                    onSelect(c.id);
                    begin(e, { kind: "trim", lane: "video", side: "right", id: c.id, startX: e.clientX, orig: c });
                  }}
                />
              </div>
            );
          })}
          {dragDx && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-blue-500"
              style={{
                left:
                  (() => {
                    const others = project.clips.filter((c) => c.id !== dragDx.id);
                    let at = 0;
                    others.slice(0, dragDx.target).forEach((c) => (at += clipLength(c)));
                    return at * pps;
                  })() - 1,
              }}
            />
          )}
          {project.clips.length === 0 && (
            <span className="absolute inset-0 flex items-center justify-center text-[11px] text-neutral-500">
              Add a video to start
            </span>
          )}
        </div>

        <div className={laneClass} onPointerDown={() => onSelect(null)}>
          {project.music.map((m) => {
            const selected = selectedId === m.id;
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                aria-label={`Song ${nameOf(m.sourceId)}`}
                className={`absolute top-1 bottom-1 rounded px-2 py-1 text-[11px] text-white overflow-hidden whitespace-nowrap cursor-grab ${
                  selected ? "ring-2 ring-white outline outline-2 outline-blue-500" : ""
                }`}
                style={{
                  left: m.at * pps,
                  width: Math.max(4, (m.end - m.start) * pps - 2),
                  background: colorOf(m.sourceId),
                  opacity: 0.92,
                }}
                onPointerDown={(e) => {
                  onSelect(m.id);
                  begin(e, { kind: "move", id: m.id, startX: e.clientX, origAt: m.at });
                }}
              >
                <span className="pointer-events-none">♪ {nameOf(m.sourceId)}</span>
                <span
                  className={`${handleClass} left-0 rounded-l`}
                  style={{ width: HANDLE }}
                  onPointerDown={(e) => {
                    onSelect(m.id);
                    begin(e, { kind: "trim", lane: "music", side: "left", id: m.id, startX: e.clientX, orig: m });
                  }}
                />
                <span
                  className={`${handleClass} right-0 rounded-r`}
                  style={{ width: HANDLE }}
                  onPointerDown={(e) => {
                    onSelect(m.id);
                    begin(e, { kind: "trim", lane: "music", side: "right", id: m.id, startX: e.clientX, orig: m });
                  }}
                />
              </div>
            );
          })}
          {project.music.length === 0 && (
            <span className="absolute inset-0 flex items-center justify-center text-[11px] text-neutral-500">
              Add a song to put it here
            </span>
          )}
        </div>

        <div
          className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-red-500"
          style={{ left: time * pps - 1 }}
        />
        </div>
      </div>
    </div>
  );
}
