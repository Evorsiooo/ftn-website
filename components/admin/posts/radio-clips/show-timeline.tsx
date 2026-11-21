"use client";
import React, { useRef } from "react";
import { AudioLines, Music } from "lucide-react";
import { MAX_CLIP_MS, MIN_CLIP_MS, clockOf, type ClipDraft, type ClipShow } from "@/lib/radio-clips/model";
import type { SongSpan } from "@/lib/radio-clips/audio";
import { cn } from "@/lib/utils";

// The show on a timeline: a strip of the whole show (where the clips are, and the part shown
// below), a ruler, the songs that played, one lane per person (when they were on air, and in
// green when they talk), and the clips over all of it. A clip is dragged to move it and by its
// edges to change its length; clicking anywhere else moves the playhead.

type Drag = { kind: "seek" } | { kind: "move" | "start" | "end"; id: string; x0: number; orig: ClipDraft } | { kind: "pan"; x0: number; view0: number };

interface Props {
  show: ClipShow;
  songs: SongSpan[];
  /** Talking spans per person, for the part of the show loaded so far. */
  talk: Map<string, [number, number][]>;
  clips: ClipDraft[];
  selectedId: string | null;
  playhead: number;
  view: { start: number; span: number };
  onView: (v: { start: number; span: number }) => void;
  onSeek: (ms: number) => void;
  onSelect: (id: string) => void;
  onClip: (clip: ClipDraft) => void;
  /** Whether talking is shown at this zoom. */
  talkShown: boolean;
  /** The show's sound over part of it (loudness bars from start to start + span), when loaded. */
  wave: { start: number; span: number; peaks: number[] } | null;
}

const pct = (ms: number, start: number, span: number) => `${((ms - start) / span) * 100}%`;

export function ShowTimeline(p: Props) {
  const { show, view } = p;
  const total = show.endedAt - show.startedAt;
  const lanes = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const end = view.start + view.span;

  const msAt = (clientX: number) => {
    const r = lanes.current!.getBoundingClientRect();
    return view.start + ((clientX - r.left) / r.width) * view.span;
  };
  const msPerPx = () => view.span / (lanes.current?.getBoundingClientRect().width || 1);
  const clampShow = (ms: number) => Math.min(show.endedAt, Math.max(show.startedAt, ms));

  const down = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = d;
    if (d.kind === "seek") p.onSeek(clampShow(msAt(e.clientX)));
    if (d.kind !== "seek" && d.kind !== "pan") p.onSelect(d.id);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "seek") return p.onSeek(clampShow(msAt(e.clientX)));
    if (d.kind === "pan") {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const start = d.view0 + ((e.clientX - d.x0) / r.width) * total;
      return p.onView({ span: view.span, start: Math.min(show.endedAt - view.span, Math.max(show.startedAt, start)) });
    }
    const dms = (e.clientX - d.x0) * msPerPx();
    const o = d.orig;
    if (d.kind === "move") {
      const len = o.endMs - o.startMs;
      const s = Math.min(show.endedAt - len, Math.max(show.startedAt, o.startMs + dms));
      p.onClip({ ...o, startMs: Math.round(s), endMs: Math.round(s + len) });
    } else if (d.kind === "start") {
      const s = Math.min(o.endMs - MIN_CLIP_MS, Math.max(o.endMs - MAX_CLIP_MS, show.startedAt, o.startMs + dms));
      p.onClip({ ...o, startMs: Math.round(s) });
    } else {
      const en = Math.max(o.startMs + MIN_CLIP_MS, Math.min(o.startMs + MAX_CLIP_MS, show.endedAt, o.endMs + dms));
      p.onClip({ ...o, endMs: Math.round(en) });
    }
  };
  const up = () => (drag.current = null);

  // ruler: a mark every 1, 2, 5, 10, 15, 30 or 60 minutes (or seconds when zoomed in), about 7 of them
  const steps = [5e3, 10e3, 15e3, 30e3, 60e3, 120e3, 300e3, 600e3, 900e3, 1800e3, 3600e3];
  const step = steps.find((s) => view.span / s <= 8) ?? 3600e3;
  const marks: number[] = [];
  for (let t = Math.ceil((view.start - show.startedAt) / step) * step + show.startedAt; t <= end; t += step) marks.push(t);

  return (
    <div className="rcl" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="rcl-heads">
        <div className="rcl-h mini" />
        <div className="rcl-h ruler" />
        <div className="rcl-h big">
          <AudioLines className="ic" /> <span>Show</span>
        </div>
        <div className="rcl-h">
          <Music className="ic" /> <span>Songs</span>
        </div>
        {show.people.map((person) => (
          <div className="rcl-h" key={person.userId} title={person.name}>
            {person.avatar ? <img src={person.avatar} alt="" /> : <span className="ini">{person.name.slice(0, 1).toUpperCase()}</span>}
            <span className="trunc">{person.name}</span>
          </div>
        ))}
      </div>
      <div className="rcl-body">
        <div className="rcl-mini" onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const at = show.startedAt + ((e.clientX - r.left) / r.width) * total;
          const start = Math.min(show.endedAt - view.span, Math.max(show.startedAt, at - view.span / 2));
          p.onView({ span: view.span, start });
          down(e, { kind: "pan", x0: e.clientX, view0: start });
        }}>
          {p.songs.map((s, i) => (
            <span key={i} className="song" style={{ left: pct(s.start, show.startedAt, total), width: pct(s.start + (s.end - s.start), s.start, total) }} />
          ))}
          {p.clips.map((c) => (
            <span key={c.id} className={cn("mk", c.id === p.selectedId && "on")} style={{ left: pct(c.startMs, show.startedAt, total), width: `max(3px, ${pct(c.endMs, c.startMs, total)})` }} />
          ))}
          <span className="vp" style={{ left: pct(view.start, show.startedAt, total), width: `max(6px, ${pct(end, view.start, total)})` }} />
        </div>
        <div className="rcl-lanes" ref={lanes} onPointerDown={(e) => down(e, { kind: "seek" })}>
          <div className="rcl-ruler">
            {marks.map((t) => (
              <span key={t} style={{ left: pct(t, view.start, view.span) }}>
                {clockOf(t - show.startedAt)}
              </span>
            ))}
          </div>
          <div className="rcl-lane big">
            {p.wave ? (
              <div className="rcl-wave" style={{ left: pct(p.wave.start, view.start, view.span), width: pct(p.wave.start + p.wave.span, p.wave.start, view.span) }}>
                {p.wave.peaks.map((v, i) => (
                  <i key={i} style={{ height: `${Math.max(4, v * 100)}%` }} />
                ))}
              </div>
            ) : (
              <span className="rcl-hint">{p.talkShown ? "Loading the show's sound…" : "Zoom in to see the show's sound and who talks"}</span>
            )}
          </div>
          <div className="rcl-lane">
            {p.songs
              .filter((s) => s.end > view.start && s.start < end)
              .map((s, i) => (
                <div key={i} className="rcl-song" style={{ left: pct(Math.max(s.start, view.start), view.start, view.span), width: pct(Math.min(s.end, end), Math.max(s.start, view.start), view.span) }} title={`${s.title} · ${s.artist}`}>
                  <Music className="ic" />
                  <span className="trunc">
                    {s.title} · {s.artist}
                  </span>
                </div>
              ))}
          </div>
          {show.people.map((person) => (
            <div className="rcl-lane" key={person.userId}>
              {show.voices
                .filter((v) => v.userId === person.userId && v.end > view.start && v.start < end)
                .map((v) => (
                  <span key={v.key} className="rcl-air" style={{ left: pct(Math.max(v.start, view.start), view.start, view.span), width: pct(Math.min(v.end, end), Math.max(v.start, view.start), view.span) }} />
                ))}
              {p.talkShown &&
                (p.talk.get(person.userId) ?? [])
                  .filter((s) => s[1] > view.start && s[0] < end)
                  .map((s, i) => <span key={i} className="rcl-talk" style={{ left: pct(Math.max(s[0], view.start), view.start, view.span), width: pct(Math.min(s[1], end), Math.max(s[0], view.start), view.span) }} />)}
            </div>
          ))}
          {p.clips
            .filter((c) => c.endMs > view.start && c.startMs < end)
            .map((c, i) => (
              <div
                key={c.id}
                className={cn("rcl-clip", c.id === p.selectedId && "on")}
                style={{ left: pct(c.startMs, view.start, view.span), width: pct(c.endMs, c.startMs, view.span) }}
                onPointerDown={(e) => down(e, { kind: "move", id: c.id, x0: e.clientX, orig: c })}
              >
                <b>{p.clips.indexOf(c) + 1 || i + 1}</b>
                <span className="hd l" onPointerDown={(e) => down(e, { kind: "start", id: c.id, x0: e.clientX, orig: c })} />
                <span className="hd r" onPointerDown={(e) => down(e, { kind: "end", id: c.id, x0: e.clientX, orig: c })} />
              </div>
            ))}
          {p.playhead >= view.start && p.playhead <= end && <div className="rcl-ph" style={{ left: pct(p.playhead, view.start, view.span) }} />}
        </div>
      </div>
    </div>
  );
}
