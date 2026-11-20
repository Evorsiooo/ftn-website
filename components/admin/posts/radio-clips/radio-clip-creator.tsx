"use client";
// Posts › Radio clip: pick a show that has a replay, mark clips on its timeline, give each one a
// headline, a Ro-State, an ad and a time, and send them all. Each clip is rendered in this browser
// (FTN+'s look, lib/radio-clips/frame.ts) and becomes a video post like any other.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Download, Loader2, Pause, Play, Plus, Scissors, Search, Shuffle, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { toast } from "@/components/gs/dialogs";
import { Select } from "@/components/ui/select";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Body, DT_CLASS, Field, PageBar, Screen, Seg, Switch } from "@/components/admin/ui";
import { RO_STATES } from "@/lib/ro-states";
import { loadImage } from "@/lib/post-template";
import { uploadMedia } from "@/lib/post-video/upload";
import { loadTimelines, renderClipAudio, songsIn, talkIn, type ClipAudio, type SongSpan } from "@/lib/radio-clips/audio";
import { buildClipFrame, dateLine as longDate, paintClipFrame, type ClipFrame } from "@/lib/radio-clips/frame";
import { exportClip } from "@/lib/radio-clips/export";
import { DEFAULT_CLIP_MS, MAX_CLIP_MS, MIN_CLIP_MS, clipLen, clockOf, parseRadioClipEdit, type ClipDraft, type ClipShow, type RadioClipEdit } from "@/lib/radio-clips/model";
import { cn } from "@/lib/utils";
import { ShowTimeline } from "./show-timeline";

const NO_AD = "none";
/** At this zoom or closer, the show's sound and who talks are loaded for the part shown. */
const DETAIL_SPAN_MS = 10 * 60_000;

type ShowCard = { id: string; title: string; show: string | null; art: string | null; startedAt: number; endedAt: number; people: { userId: string; name: string; avatar: string | null }[]; clips: { posted: number; inProgress: number } };

interface Props {
  seg: React.ReactNode;
  leave: () => void;
  ads: any[];
  suggestedAdId: string | null;
  /** A saved radio clip post to change (draft or waiting for approval). */
  editPost: any | null;
  uploadPoster: (poster: Blob) => Promise<string>;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const fromLocalInput = (v: string) => new Date(v).getTime();
const newId = () => Math.random().toString(36).slice(2, 10);
// "Thu 20 Nov" and "19:00", as in the mockups
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const clipsNote = (c: { posted: number; inProgress: number }) =>
  [c.inProgress && `${c.inProgress} clip${c.inProgress === 1 ? "" : "s"} in progress`, c.posted && `${c.posted} clip${c.posted === 1 ? "" : "s"} posted`].filter(Boolean).join(" · ");
const sendLabel = (c: ClipDraft) => (c.sendAt ? `${dayFmt.format(new Date(c.sendAt))} ${timeFmt.format(new Date(c.sendAt))}` : "Right away");
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "radio-clip";
const audioKey = (c: { startMs: number; endMs: number; music: boolean }) => `${c.startMs}-${c.endMs}-${c.music ? 1 : 0}`;

export function RadioClipCreator({ seg, leave, ads, suggestedAdId, editPost, uploadPoster }: Props) {
  const router = useRouter();
  const editing = editPost ? parseRadioClipEdit(editPost.videoEdit) : null;
  const editingDraft = editPost?.status === "draft";

  // ---------------------------------------------------------------- the show
  const [shows, setShows] = useState<ShowCard[] | null>(null);
  const [query, setQuery] = useState("");
  const [showFilter, setShowFilter] = useState("");
  const [show, setShow] = useState<ClipShow | null>(null);
  const [opening, setOpening] = useState(false);
  const [songs, setSongs] = useState<SongSpan[]>([]);

  useEffect(() => {
    if (editing) return;
    fetch("/api/admin/posts/radio-shows")
      .then((r) => r.json())
      .then((d: any) => setShows(Array.isArray(d?.shows) ? d.shows : []))
      .catch(() => setShows([]));
     
  }, []);

  const openShow = useCallback(async (id: string) => {
    setOpening(true);
    try {
      const res = await fetch(`/api/admin/posts/radio-shows/${encodeURIComponent(id)}`);
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error || "Could not open the show");
      const s = data.show as ClipShow;
      setShow(s);
      setPlayhead(s.startedAt);
      setView({ start: s.startedAt, span: Math.min(DETAIL_SPAN_MS, s.endedAt - s.startedAt) });
      setSongs(songsIn(await loadTimelines(s), s.startedAt, s.endedAt));
      return s;
    } catch (err: any) {
      toast(err.message || "Could not open the show");
      return null;
    } finally {
      setOpening(false);
    }
  }, []);

  // ---------------------------------------------------------------- clips
  const [clips, setClips] = useState<ClipDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = clips.find((c) => c.id === selectedId) ?? null;
  const index = selected ? clips.indexOf(selected) : -1;
  const setClip = (c: ClipDraft) => setClips((list) => list.map((x) => (x.id === c.id ? c : x)));
  const patch = (changes: Partial<ClipDraft>) => selected && setClip({ ...selected, ...changes });

  // open the post being edited
  useEffect(() => {
    if (!editing || !editPost) return;
    void openShow(editing.replayId).then((s) => {
      if (!s) return;
      const c: ClipDraft = {
        id: editPost.id,
        startMs: editing.startMs,
        endMs: editing.endMs,
        headline: editPost.headline,
        roState: editPost.roState,
        adId: editPost.noAd ? NO_AD : editPost.adId || "",
        music: editing.music,
        sendAt: editPost.scheduledAt ? toLocalInput(new Date(editPost.scheduledAt)) : "",
      };
      setClips([c]);
      setSelectedId(c.id);
      setPlayhead(c.startMs);
      setView({ start: Math.max(s.startedAt, c.startMs - 60_000), span: Math.min(DETAIL_SPAN_MS / 2, s.endedAt - s.startedAt) });
    });
     
  }, []);

  const newClip = () => {
    if (!show) return;
    const start = Math.min(playhead, show.endedAt - MIN_CLIP_MS);
    const prev = selected ?? clips[clips.length - 1];
    const c: ClipDraft = {
      id: newId(),
      startMs: Math.round(start),
      endMs: Math.round(Math.min(show.endedAt, start + DEFAULT_CLIP_MS)),
      headline: "",
      roState: prev?.roState ?? "",
      adId: prev?.adId ?? suggestedAdId ?? "",
      music: prev?.music ?? true,
      sendAt: "",
    };
    setClips((list) => [...list, c].sort((x, y) => x.startMs - y.startMs));
    setSelectedId(c.id);
  };

  const splitClip = () => {
    if (!selected || playhead - selected.startMs < MIN_CLIP_MS || selected.endMs - playhead < MIN_CLIP_MS) {
      return toast(`Put the playhead inside the clip, at least ${MIN_CLIP_MS / 1000} s from both ends, to split it.`);
    }
    const second: ClipDraft = { ...selected, id: newId(), startMs: Math.round(playhead), headline: "" };
    setClips((list) => list.flatMap((x) => (x.id === selected.id ? [{ ...x, endMs: Math.round(playhead) }, second] : [x])));
    setSelectedId(second.id);
  };

  const removeClip = () => {
    if (!selected) return;
    setClips((list) => list.filter((x) => x.id !== selected.id));
    setSelectedId(null);
  };

  // ---------------------------------------------------------------- timeline view, sound and talking
  const [playhead, setPlayhead] = useState(0);
  const [view, setView] = useState({ start: 0, span: DETAIL_SPAN_MS });
  const [talk, setTalk] = useState<Map<string, [number, number][]>>(new Map());
  const [wave, setWave] = useState<{ start: number; span: number; peaks: number[] } | null>(null);
  const detail = !!show && view.span <= DETAIL_SPAN_MS + 1;

  useEffect(() => {
    if (!show || !detail) return setWave(null);
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const a = view.start;
        const b = Math.min(show.endedAt, view.start + view.span);
        const [spans, sound] = await Promise.all([
          talkIn(show, a, b),
          renderClipAudio(show, a, b, true, { bars: 240, sampleRate: 8000, channels: 1, signal: ac.signal }),
        ]);
        if (ac.signal.aborted) return;
        setTalk((old) => {
          const next = new Map(old);
          for (const [u, list] of spans) next.set(u, [...(next.get(u) ?? []).filter((s) => s[1] <= a || s[0] >= b), ...list].sort((x, y) => x[0] - y[0]));
          return next;
        });
        setWave({ start: a, span: b - a, peaks: sound.peaks });
      } catch (err) {
        // the lane keeps saying it is loading; the clips still render
        if (!ac.signal.aborted) console.warn("Could not load the show's sound:", err);
      }
    }, 400);
    setWave((w) => (w && w.start === view.start && w.span === view.span ? w : null));
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [show, detail, view.start, view.span]);

  // ---------------------------------------------------------------- the selected clip's frame and sound
  const audios = useRef(new Map<string, Promise<ClipAudio>>());
  const clipAudio = useCallback(
    (c: ClipDraft) => {
      const key = audioKey(c);
      let p = audios.current.get(key);
      if (!p) {
        p = renderClipAudio(show!, c.startMs, c.endMs, c.music);
        p.catch(() => audios.current.delete(key));
        audios.current.set(key, p);
        while (audios.current.size > 8) audios.current.delete(audios.current.keys().next().value!);
      }
      return p;
    },
    [show]
  );
  const [frame, setFrame] = useState<ClipFrame | null>(null);
  const [clipTalk, setClipTalk] = useState<Map<string, [number, number][]>>(new Map());
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [frameError, setFrameError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);

  /** The people heard in a clip: whoever talks in it, else whoever was on air. */
  const stageFor = useCallback(
    async (c: ClipDraft) => {
      const spans = await talkIn(show!, c.startMs, c.endMs);
      const talking = show!.people.filter((p) => (spans.get(p.userId) ?? []).length > 0);
      const onAir = show!.people.filter((p) => show!.voices.some((v) => v.userId === p.userId && v.end > c.startMs && v.start < c.endMs));
      return { people: talking.length ? talking : onAir, spans };
    },
    [show]
  );

  const buildFrame = useCallback(
    async (c: ClipDraft) => {
      const ad = c.adId && c.adId !== NO_AD ? ads.find((a) => a.id === c.adId) : null;
      const [adImg, stage] = await Promise.all([ad ? loadImage(ad.imageUrl) : Promise.resolve(null), stageFor(c)]);
      const f = await buildClipFrame({
        showName: show!.title,
        art: show!.art,
        date: show!.startedAt,
        headline: c.headline,
        people: stage.people.slice(0, 5),
        ad: adImg,
        noAd: c.adId === NO_AD,
      });
      return { frame: f, talk: stage.spans };
    },
    [ads, show, stageFor]
  );

  useEffect(() => {
    if (!show || !selected) return setFrame(null);
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const built = await buildFrame(selected);
        if (!alive) return;
        setFrame(built.frame);
        setClipTalk(built.talk);
        setFrameError("");
      } catch (err: any) {
        if (alive) setFrameError(err?.message || "Could not draw the clip");
      }
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // the frame depends on what is drawn, not on where the playhead is
     
  }, [show, selected?.id, selected?.headline, selected?.adId, selected?.startMs, selected?.endMs, buildFrame]);

  // the waveform of the selected clip, once its sound is rendered
  useEffect(() => {
    if (!show || !selected) return setPeaks(null);
    let alive = true;
    setPeaks(null);
    const t = setTimeout(() => {
      clipAudio(selected)
        .then((a) => alive && setPeaks(a.peaks))
        .catch(() => {});
    }, 600);
    return () => {
      alive = false;
      clearTimeout(t);
    };
     
  }, [show, selected?.id, selected?.startMs, selected?.endMs, selected?.music, clipAudio]);

  // draw the preview at the playhead (the clip's first frame when the playhead is outside it)
  useEffect(() => {
    const el = canvas.current;
    if (!el || !frame || !selected) return;
    el.width = frame.layout.width;
    el.height = frame.layout.height;
    const inside = playhead >= selected.startMs && playhead <= selected.endMs;
    const ms = inside ? playhead : selected.startMs;
    paintClipFrame(el.getContext("2d")!, frame, peaks, (ms - selected.startMs) / clipLen(selected), clipTalk, ms);
  }, [frame, peaks, clipTalk, playhead, selected]);

  // ---------------------------------------------------------------- playback
  const [playing, setPlaying] = useState(false);
  const [loadingSound, setLoadingSound] = useState(false);
  const player = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode; raf: number } | null>(null);
  const stop = useCallback(() => {
    const p = player.current;
    player.current = null;
    if (p) {
      cancelAnimationFrame(p.raf);
      try {
        p.src.stop();
      } catch {
        /* already stopped */
      }
      void p.ctx.close();
    }
    setPlaying(false);
  }, []);
  useEffect(() => stop, [stop]);

  const play = async () => {
    if (!show) return;
    if (playing) return stop();
    // inside the selected clip: its own sound; anywhere else: the next 30 seconds of the show
    const inClip = selected && playhead >= selected.startMs && playhead < selected.endMs - 50 ? selected : null;
    const from = playhead >= show.endedAt - 500 ? show.startedAt : playhead;
    const win = inClip ?? { startMs: from, endMs: Math.min(show.endedAt, from + 30_000), music: true };
    setLoadingSound(true);
    let sound: ClipAudio;
    try {
      sound = inClip ? await clipAudio(inClip) : await renderClipAudio(show, win.startMs, win.endMs, true);
    } catch (err: any) {
      setLoadingSound(false);
      return toast(err?.message || "Could not load the sound");
    }
    setLoadingSound(false);
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = sound.buffer;
    src.connect(ctx.destination);
    const offset = Math.max(0, (from - win.startMs) / 1000);
    const t0 = ctx.currentTime + 0.05;
    src.start(t0, offset);
    src.onended = () => player.current?.src === src && stop();
    const tick = () => {
      const ms = win.startMs + (offset + Math.max(0, ctx.currentTime - t0)) * 1000;
      setPlayhead(Math.min(win.endMs, ms));
      if (player.current) player.current.raf = requestAnimationFrame(tick);
    };
    player.current = { ctx, src, raf: requestAnimationFrame(tick) };
    setPlaying(true);
  };

  const seek = (ms: number) => {
    if (playing) stop();
    setPlayhead(ms);
  };
  const jump = (dir: -1 | 1) => {
    if (!show) return;
    const marks = [show.startedAt, ...clips.map((c) => c.startMs), show.endedAt].sort((a, b) => a - b);
    const to = dir < 0 ? [...marks].reverse().find((m) => m < playhead - 500) : marks.find((m) => m > playhead + 500);
    if (to !== undefined) {
      seek(to);
      if (to < view.start || to > view.start + view.span) setView((v) => ({ ...v, start: Math.min(show.endedAt - v.span, Math.max(show.startedAt, to - v.span / 4)) }));
    }
  };

  // zoom: 1 minute to the whole show, kept around the playhead
  const total = show ? show.endedAt - show.startedAt : 1;
  const minSpan = Math.min(60_000, total);
  const zoomValue = show ? Math.log(total / view.span) / Math.log(total / minSpan || 2) : 0;
  const setZoom = (z: number) => {
    if (!show) return;
    const span = Math.max(minSpan, Math.min(total, total / Math.pow(total / minSpan, z)));
    const start = Math.min(show.endedAt - span, Math.max(show.startedAt, playhead - span / 2));
    setView({ start, span });
  };

  // ---------------------------------------------------------------- schedule all
  const [scheduling, setScheduling] = useState(false);
  const [firstAt, setFirstAt] = useState("");
  const [everyHours, setEveryHours] = useState(3);
  const applySchedule = () => {
    if (!firstAt) return toast("Pick when the first clip goes out.");
    const t0 = fromLocalInput(firstAt);
    setClips((list) => list.map((c, i) => ({ ...c, sendAt: toLocalInput(new Date(t0 + i * everyHours * 3_600_000)) })));
    setScheduling(false);
  };

  // ---------------------------------------------------------------- saving
  const [busy, setBusy] = useState<string | null>(null);
  const headlineLines = frame?.layout.headlineLines.length ?? 0;

  const check = async (c: ClipDraft, i: number): Promise<string | null> => {
    const name = clips.length > 1 ? `Clip ${i + 1}: ` : "";
    if (!c.headline.trim()) return `${name}write a headline.`;
    if (!c.roState) return `${name}choose a Ro-State.`;
    if (clipLen(c) > MAX_CLIP_MS + 1) return `${name}a clip can be at most ${MAX_CLIP_MS / 1000} seconds.`;
    if (c.sendAt && !(fromLocalInput(c.sendAt) > Date.now() + 60_000)) return `${name}pick a time in the future, or choose Right away.`;
    const ad = c.adId && c.adId !== NO_AD ? ads.find((a) => a.id === c.adId) : null;
    if (c.adId && c.adId !== NO_AD && !ad) return `${name}its ad is no longer available. Pick another.`;
    const built = await buildFrame(c);
    if (built.frame.layout.headlineOverflow) return `${name}the headline is longer than 3 lines. Please shorten it.`;
    return null;
  };

  const render = async (c: ClipDraft, label: string) => {
    const built = await buildFrame(c);
    setBusy(`${label}: getting the sound`);
    const sound = await clipAudio(c);
    return exportClip({
      frame: built.frame,
      audio: sound.buffer,
      peaks: sound.peaks,
      talk: built.talk,
      startMs: c.startMs,
      onProgress: (f) => setBusy(`${label}: rendering ${Math.round(f * 100)}%`),
    });
  };

  const saveAll = async (asDraft: boolean) => {
    if (!show) return;
    const list = editing ? clips.slice(0, 1) : clips;
    if (!list.length) return toast("Make a clip first: move the playhead and press New clip here.");
    stop();
    for (let i = 0; i < list.length; i++) {
      const problem = await check(list[i]!, i);
      if (problem) {
        setSelectedId(list[i]!.id);
        return toast(problem[0]!.toUpperCase() + problem.slice(1));
      }
    }
    let sent = 0;
    try {
      for (let i = 0; i < list.length; i++) {
        const c = list[i]!;
        const label = list.length > 1 ? `Clip ${i + 1} of ${list.length}` : "Clip";
        setSelectedId(c.id);
        const out = await render(c, label);
        setBusy(`${label}: uploading`);
        const [videoUrl, imageUrl] = await Promise.all([uploadMedia(out.video, { kind: "final", name: "clip.mp4" }), uploadPoster(out.poster)]);
        const edit: RadioClipEdit = { v: "radio", replayId: show.id, startMs: c.startMs, endMs: c.endMs, music: c.music, showStartedAt: show.startedAt };
        const noAd = c.adId === NO_AD;
        const payload: Record<string, unknown> = {
          headline: c.headline.trim(),
          body: "",
          logo: "",
          roState: c.roState,
          adId: noAd ? null : c.adId || null,
          noAd,
          backgroundUrl: null,
          mediaType: "video",
          imageUrl,
          videoUrl,
          videoEdit: JSON.stringify(edit),
        };
        const creating = !editPost;
        if (creating && asDraft) payload.draft = true;
        if (editingDraft && !asDraft) payload.publish = true;
        if (!asDraft && (creating || editingDraft) && c.sendAt) payload.scheduledAt = fromLocalInput(c.sendAt);
        const res = await fetch(editPost ? `/api/admin/posts/${editPost.id}` : "/api/admin/posts", {
          method: editPost ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as any;
        if (!res.ok) throw new Error(data.error || "Failed to save the clip");
        if (data.discordWarning) toast(`${label} was saved, but sending it to Discord failed:\n${data.discordWarning}\nUse Resend on the post to try again.`);
        sent++;
        if (!editPost) setClips((l) => l.filter((x) => x.id !== c.id));
      }
      toast(editPost ? "Clip saved." : asDraft ? `${sent === 1 ? "Draft" : `${sent} drafts`} saved.` : `${sent === 1 ? "Clip" : `${sent} clips`} sent.`);
      router.push("/admin/posts");
    } catch (err: any) {
      toast(`${sent ? `${sent} clip${sent === 1 ? " was" : "s were"} saved. ` : ""}${err?.message || "Could not save the clips"}`);
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    if (!selected) return toast("Select a clip first.");
    const problem = await check(selected, index);
    if (problem) return toast(problem[0]!.toUpperCase() + problem.slice(1));
    stop();
    try {
      const out = await render(selected, "Clip");
      const url = URL.createObjectURL(out.video);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug(selected.headline)}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err: any) {
      toast(err?.message || "Could not create the video");
    } finally {
      setBusy(null);
    }
  };

  // ---------------------------------------------------------------- page
  const n = editing ? 1 : clips.length;
  const sendText = busy
    ? "Working…"
    : editPost && !editingDraft
      ? "Save changes"
      : editPost
        ? "Send for approval"
        : `Send ${n === 1 ? "1 clip" : `${n} clips`} for approval`;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (shows ?? []).filter((s) => (!showFilter || (s.show ?? s.title) === showFilter) && (!q || `${s.title} ${s.show ?? ""}`.toLowerCase().includes(q)));
  }, [shows, query, showFilter]);
  const showNames = useMemo(() => [...new Set((shows ?? []).map((s) => s.show ?? s.title))].sort(), [shows]);
  const adLabel = (a: any) => `${a.organizerName} · ${a.title} (${a.impressionsLeft === null ? "unlimited" : `${a.impressionsLeft} left`})`;

  return (
    <Screen>
      <PageBar
        crumb={{
          href: "/admin/posts",
          label: "Posts",
          onClick: (e) => {
            e.preventDefault();
            leave();
          },
        }}
        title={editPost ? (editingDraft ? "Edit draft" : "Edit radio clip") : "New radio clips"}
        tools={seg}
        end={
          show ? (
            <>
              {(!editPost || editingDraft) && (
                <button type="button" className="btn ghost hide-m" disabled={!!busy} onClick={() => saveAll(true)}>
                  {editPost ? "Save draft" : "Save drafts"}
                </button>
              )}
              <button type="button" className="btn hide-m" disabled={!!busy || !selected} onClick={download} title="Download without saving">
                <Download className="ic" />
                {selected ? `Download clip ${index + 1}` : "Download"}
              </button>
              <button type="button" className="btn primary lg hide-m" disabled={!!busy || !n} onClick={() => saveAll(false)}>
                {sendText}
              </button>
            </>
          ) : undefined
        }
        mrow={seg}
      />
      {!show ? (
        <Body scroll>
          <div className="rpick">
            <h2>Pick a show to clip</h2>
            <p className="muted">Every show that has a replay. Its name, logo and date go on the clips.</p>
            <div className="rpick-tools">
              <label className="search">
                <Search className="ic" />
                <input className="input" placeholder="Search shows" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <Select className="select hide-m" value={showFilter} onChange={(e) => setShowFilter(e.target.value)} aria-label="Show">
                <option value="">All shows</option>
                {showNames.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            {shows === null || opening ? (
              <div className="help">
                <Loader2 className="ic spin" /> {opening ? "Opening the show…" : "Loading shows…"}
              </div>
            ) : filtered.length === 0 ? (
              <div className="help">{shows.length ? "No show matches." : "No show has a replay yet. Shows made in the Studio get one when they end."}</div>
            ) : (
              <div className="rpick-list">
                {filtered.map((s) => (
                  <div key={s.id} className="rpick-row">
                    {s.art ? <img className="a" src={s.art} alt="" /> : <span className="a ph" />}
                    <div className="grow">
                      <div className="nm trunc">{s.title}</div>
                      <div className="t12 muted">
                        {dayFmt.format(new Date(s.startedAt))} · {timeFmt.format(new Date(s.startedAt))} · {clockOf(s.endedAt - s.startedAt)}
                      </div>
                    </div>
                    <div className="ppl hide-m">
                      {s.people.slice(0, 5).map((p) => (p.avatar ? <img key={p.userId} src={p.avatar} alt={p.name} title={p.name} /> : <span key={p.userId} className="ini" title={p.name}>{p.name.slice(0, 1)}</span>))}
                    </div>
                    <span className="t12 muted hide-m cnt">{clipsNote(s.clips)}</span>
                    <button type="button" className="btn sm" onClick={() => void openShow(s.id)}>
                      Clip
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Body>
      ) : (
        <Body>
          <div className="creator video rclip">
            <div className="stage">
              {selected ? <canvas ref={canvas} width={1024} height={1024} /> : <div className="help">Move the playhead to a moment you like and press New clip here.</div>}
              {frameError && <div className="err">{frameError}</div>}
            </div>

            <div className="creator-form">
              {selected ? (
                <>
                  <div className="rc-head">
                    <span className="cnum">{index + 1}</span>
                    <div className="grow">
                      <div className="b">Clip {index + 1}</div>
                      <div className="t12 muted">
                        {clockOf(selected.startMs - show.startedAt)} to {clockOf(selected.endMs - show.startedAt)} · {Math.round(clipLen(selected) / 1000)} s
                      </div>
                    </div>
                    {!editing && (
                      <button type="button" className="iconbtn" title="Delete clip" aria-label="Delete clip" onClick={removeClip}>
                        <Trash2 className="ic" />
                      </button>
                    )}
                  </div>
                  <Field
                    label={
                      <span style={{ display: "flex", justifyContent: "space-between" }}>
                        Headline
                        <span className={frame?.layout.headlineOverflow ? "err" : "help"} style={{ fontWeight: 400 }}>
                          {frame?.layout.headlineOverflow ? "Too long: only 3 lines fit" : `${selected.headline.trim() ? headlineLines : 0} of 3 lines`}
                        </span>
                      </span>
                    }
                  >
                    <textarea
                      value={selected.headline}
                      onChange={(e) => patch({ headline: e.target.value.replace(/\s*\n+\s*/g, " ") })}
                      onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                      rows={2}
                      className="textarea"
                      style={{ resize: "vertical" }}
                      placeholder="What was said"
                    />
                  </Field>
                  <Field label="Ro-State">
                    <div className="states" role="radiogroup" aria-label="Ro-State">
                      {RO_STATES.map((s) => (
                        <button key={s.key} type="button" role="radio" aria-checked={selected.roState === s.key} className={selected.roState === s.key ? "on" : ""} onClick={() => patch({ roState: s.key })}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Ad" help="The clip uses one of the ad's impressions. Auto picks the next ad in rotation.">
                    <div style={{ display: "flex", gap: 8 }}>
                      <Select value={selected.adId} onChange={(e) => patch({ adId: e.target.value })} className="select h-9 min-w-0 flex-1" aria-label="Ad">
                        <option value="">Placeholder (&quot;your advertisement here&quot;)</option>
                        <option value={NO_AD}>No ad</option>
                        {ads.map((a) => (
                          <option key={a.id} value={a.id} disabled={!a.imageUrl.startsWith("/")}>
                            {adLabel(a)}
                          </option>
                        ))}
                      </Select>
                      <button type="button" className="btn" disabled={!suggestedAdId} onClick={() => suggestedAdId && patch({ adId: suggestedAdId })} title="Pick the next ad in rotation">
                        <Shuffle className="ic" /> Auto
                      </button>
                    </div>
                  </Field>
                  <Field label="Songs" help={selected.music ? "The songs that played stay under the voices, lowered while people talk." : "Only the voices."}>
                    <label className="rc-toggle">
                      <Switch checked={selected.music} onChange={(v) => patch({ music: v })} label="Keep the songs under the voices" />
                      Keep the songs under the voices
                    </label>
                  </Field>
                  {(!editPost || editingDraft) && (
                    <Field label="When" help={selected.sendAt ? "Goes to #ftn-plus and #leadership at this time, then waits for approval like any post." : "Sent to Discord for approval as soon as you press Send."}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <Seg
                          value={selected.sendAt ? "later" : "now"}
                          onChange={(v) => patch({ sendAt: v === "now" ? "" : toLocalInput(new Date(Date.now() + 3_600_000)) })}
                          options={[
                            { value: "now", label: "Right away" },
                            { value: "later", label: "Later" },
                          ]}
                          label="When"
                        />
                        {selected.sendAt && (
                          <DateTimeInput type="datetime-local" value={selected.sendAt} min={toLocalInput(new Date())} onChange={(e) => patch({ sendAt: e.target.value })} className={cn(DT_CLASS, "rc-when")} placeholder="Pick a date and time" />
                        )}
                      </div>
                    </Field>
                  )}
                  <Field label="From" help="The show's name, logo and date on the video come from here. People on the video are whoever is talking in the clip.">
                    <div className="rc-from">
                      {show.art ? <img src={show.art} alt="" /> : <span className="ph" />}
                      <div className="grow">
                        <div className="b trunc">{show.title}</div>
                        <div className="t12 muted">{longDate(show.startedAt)} · replay</div>
                      </div>
                    </div>
                  </Field>
                </>
              ) : (
                <div className="help">No clip selected. Make one with New clip here, or click one on the timeline.</div>
              )}
            </div>

            <div className="vdock-host">
              <div className="vdock">
                <div className="vbar rc-vbar">
                  <div className="vbar-l">
                    {!editing && (
                      <button type="button" className="btn sm hide-m" onClick={() => (stop(), setShow(null), setClips([]), setSelectedId(null))}>
                        <ArrowLeft className="ic" /> Change show
                      </button>
                    )}
                  </div>
                  <div className="vbar-c">
                    <button type="button" className="iconbtn" aria-label="Back" title="Previous clip" onClick={() => jump(-1)}>
                      <SkipBack className="ic" />
                    </button>
                    <button type="button" className="vplay" aria-label={playing ? "Pause" : "Play"} onClick={play} disabled={loadingSound}>
                      {loadingSound ? <Loader2 className="ic spin" /> : playing ? <Pause className="ic" /> : <Play className="ic" />}
                    </button>
                    <button type="button" className="iconbtn" aria-label="Next" title="Next clip" onClick={() => jump(1)}>
                      <SkipForward className="ic" />
                    </button>
                    <span className="vtime">
                      {clockOf(playhead - show.startedAt)} <span className="faint">/ {clockOf(total)}</span>
                    </span>
                  </div>
                  <div className="vbar-r">
                    {!editing && (
                      <button type="button" className="btn sm primary" onClick={newClip}>
                        <Plus className="ic" /> New clip here
                      </button>
                    )}
                    {!editing && (
                      <button type="button" className="iconbtn hide-m" title="Split the clip at the playhead" aria-label="Split the clip at the playhead" onClick={splitClip}>
                        <Scissors className="ic" />
                      </button>
                    )}
                    <input type="range" className="range hide-m rc-zoom" min={0} max={1} step={0.01} value={zoomValue} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" />
                  </div>
                </div>
                {busy && (
                  <div className="vstatus">
                    <span className="vrender">
                      <Loader2 className="ic spin" /> {busy}
                    </span>
                  </div>
                )}
                <div className="rc-main">
                  <ShowTimeline
                    show={show}
                    songs={songs}
                    talk={talk}
                    clips={clips}
                    selectedId={selectedId}
                    playhead={playhead}
                    view={view}
                    onView={setView}
                    onSeek={seek}
                    onSelect={setSelectedId}
                    onClip={setClip}
                    talkShown={detail}
                    wave={wave}
                  />
                  <div className="rc-list">
                    <div className="rc-list-h">
                      <b>Clips</b>
                      <span className="muted">{clips.length}</span>
                      {!editing && (
                        <button type="button" className="btn sm" style={{ marginLeft: "auto" }} disabled={!clips.length} onClick={() => setScheduling((v) => !v)}>
                          <Clock className="ic" /> Schedule all
                        </button>
                      )}
                    </div>
                    {scheduling && (
                      <div className="rc-sched">
                        <label className="help">First clip at</label>
                        <DateTimeInput type="datetime-local" value={firstAt} min={toLocalInput(new Date())} onChange={(e) => setFirstAt(e.target.value)} className={DT_CLASS} placeholder="Pick a date and time" />
                        <label className="help">
                          then one every{" "}
                          <select className="select sm" value={everyHours} onChange={(e) => setEveryHours(Number(e.target.value))}>
                            {[1, 2, 3, 4, 6, 8, 12, 24].map((h) => (
                              <option key={h} value={h}>
                                {h} hour{h === 1 ? "" : "s"}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="button" className="btn sm primary" onClick={applySchedule}>
                          Apply to {clips.length} clip{clips.length === 1 ? "" : "s"}
                        </button>
                      </div>
                    )}
                    <div className="rc-rows">
                      {clips.map((c, i) => (
                        <button type="button" key={c.id} className={cn("rc-row", c.id === selectedId && "on")} onClick={() => (setSelectedId(c.id), seek(c.startMs))}>
                          <span className={cn("cnum", c.id !== selectedId && "o")}>{i + 1}</span>
                          <span className="grow">
                            <span className={cn("t trunc", !c.headline.trim() && "faint")}>{c.headline.trim() || "No headline yet"}</span>
                            <span className="s">
                              {clockOf(c.startMs - show.startedAt)} · {Math.round(clipLen(c) / 1000)} s · <Clock className="ic" />
                              {sendLabel(c)}
                            </span>
                          </span>
                        </button>
                      ))}
                      {!clips.length && <div className="help" style={{ padding: "8px 12px" }}>No clips yet.</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="creator-send">
            {(!editPost || editingDraft) && (
              <button type="button" className="btn" disabled={!!busy} onClick={() => saveAll(true)}>
                {editPost ? "Save draft" : "Save drafts"}
              </button>
            )}
            <button type="button" className="btn primary" disabled={!!busy || !n} onClick={() => saveAll(false)}>
              {busy ? "Working…" : editPost && !editingDraft ? "Save changes" : `Send ${n === 1 ? "1 clip" : `${n} clips`}`}
            </button>
          </div>
        </Body>
      )}
    </Screen>
  );
}
