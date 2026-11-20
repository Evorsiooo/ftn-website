"use client";
// Replays: past shows, listened back to on FTN+. A replay isn't one recorded file: it is rebuilt
// in the browser from the running orders that played (the same engine and mixes) and each
// person's recorded voice, so it sounds like the show did.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRadio } from "@/components/radio/radio-provider";
import { RADIO_FILES } from "@/components/radio/use-radio-source";
import { loadStationModule } from "@/components/radio/use-radio-player";
import { TALK_DUCK, TalkDetector } from "@/components/radio/voice";
import type { RadioTimeline } from "@/lib/radio/autodj";
import * as I from "./icons";
import { Volume } from "./radio-controls";

type ReplayCard = { id: string; title: string; show: string | null; art: string | null; startedAt: number; endedAt: number };

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dur = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
};

/** Past shows, newest first, read again whenever a show starts or ends. */
function useReplayList(): ReplayCard[] | null {
  const [list, setList] = useState<ReplayCard[] | null>(null);
  // read again whenever a show starts or ends (the Studio show, or a scheduled airing), so a show
  // that just finished is there without a reload; a few seconds later too, as the replay is closed
  // off by the same action that ends the show
  const radio = useRadio();
  const showKey = `${radio.program?.studio?.id ?? ""}|${radio.airing?.id ?? ""}`;
  useEffect(() => {
    let alive = true;
    const read = () =>
      fetch("/api/radio/replays", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: any) => alive && setList(Array.isArray(d?.replays) ? d.replays.slice(0, 8) : []))
        .catch(() => alive && setList((l) => l ?? []));
    void read();
    const again = setTimeout(read, 8000);
    return () => {
      alive = false;
      clearTimeout(again);
    };
  }, [showKey]);
  return list;
}

/** The radio page's list of past shows. */
export function Replays() {
  const list = useReplayList();
  if (!list?.length) return null;
  return (
    <div className="rsec">
      <div className="rowh">
        <h2 className="h2">Replays</h2>
      </div>
      <div className="replays">
        {list.map((r) => (
          <Link key={r.id} href={`/plus/radio/replays/${r.id}`}>
            {r.art ? <img src={r.art} alt="" /> : <div className="ph-art" />}
            <div className="n">{r.title}</div>
            <div className="w">
              {dateFmt.format(new Date(r.startedAt))} · {dur(r.endedAt - r.startedAt)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Hours:minutes:seconds, like a video's length. */
const length = (ms: number) => {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Home: the latest radio shows to listen back to, as a row of cards like the video rows (the
 * show's square art on a blurred copy of itself, its length in the corner), under the Radio row.
 */
export function ReplaysRow() {
  const list = useReplayList();
  if (!list?.length) return null;
  return (
    <>
      <div className="rowh">
        <h2 className="h2">Radio replays</h2>
        <Link href="/plus/radio">See all</Link>
      </div>
      <div className="cards one-row">
        {list.slice(0, 6).map((r) => (
          <Link key={r.id} href={`/plus/radio/replays/${r.id}`} className="card">
            <div className="th rep">
              {r.art ? (
                <>
                  <img className="bg" src={r.art} alt="" loading="lazy" />
                  <img className="sq" src={r.art} alt="" loading="lazy" />
                </>
              ) : (
                <div className="ph">
                  <I.Radio />
                </div>
              )}
              <span className="dur">{length(r.endedAt - r.startedAt)}</span>
            </div>
            <div className="meta">
              <span className="logo-fallback" aria-hidden>
                <I.Radio />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="t">{r.title}</div>
                <div className="s">Radio · {dateFmt.format(new Date(r.startedAt))}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- player

type ReplayData = {
  replay: ReplayCard & { kind: string };
  timelines: string[];
  voices: { key: string; start: number; end: number }[];
  pauses: { start: number; end: number }[];
};

type ReplayStation = { nowMs(): number; setVolume(v: number): void; setVoiceDuck(l: number): void; stop(): void; status(): { state: string } };
type ReplayModule = {
  startReplay(o: { timelines: RadioTimeline[]; pauses: { start: number; end: number }[]; fromMs: number; volume?: number }): Promise<ReplayStation>;
};

const fileUrl = (key: string) => `${RADIO_FILES}/${key.split("/").map(encodeURIComponent).join("/")}`;
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s % 60).padStart(2, "0")}`;
};

export function ReplayPage({ id }: { id: string }) {
  const radio = useRadio();
  const [data, setData] = useState<ReplayData | null | "missing">(null);
  const [timelines, setTimelines] = useState<RadioTimeline[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  // while the scrub bar is held: where it's at (the replay only jumps there when it's let go)
  const [drag, setDrag] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  dragRef.current = drag;
  const station = useRef<ReplayStation | null>(null);
  // bumped by every start and stop: a start that finishes after a newer one stops itself, so two
  // replays never play over each other
  const gen = useRef(0);
  const voices = useRef(new Map<string, HTMLAudioElement>());
  const detector = useRef<TalkDetector | null>(null);
  const volume = radio.muted ? 0 : radio.volume;
  const volRef = useRef(volume);
  volRef.current = volume;

  useEffect(() => {
    fetch(`/api/radio/replays/${encodeURIComponent(id)}`)
      .then((r): Promise<ReplayData | "missing"> => (r.ok ? (r.json() as Promise<ReplayData>) : Promise.resolve("missing")))
      .then(async (d: ReplayData | "missing") => {
        setData(d);
        if (d === "missing") return;
        setAt(d.replay.startedAt);
        const tls = await Promise.all(d.timelines.map((k) => fetch(fileUrl(k)).then((r) => (r.ok ? (r.json() as Promise<RadioTimeline>) : null)).catch(() => null)));
        setTimelines(tls.filter((t): t is RadioTimeline => !!t));
      })
      .catch(() => setData("missing"));
  }, [id]);

  const stopAll = useCallback(() => {
    gen.current++;
    station.current?.stop();
    station.current = null;
    for (const el of voices.current.values()) el.pause();
    setPlaying(false);
  }, []);

  const start = useCallback(
    async (fromMs: number) => {
      if (!data || data === "missing" || !timelines) return;
      stopAll();
      const mine = gen.current;
      // the live radio stops while a replay plays
      if (radio.status !== "idle") radio.stop();
      // the same versioned engine URL as the live radio, so a browser never runs a cached old engine
      const mod = (await loadStationModule()) as unknown as ReplayModule;
      if (mine !== gen.current) return;
      const st = await mod.startReplay({ timelines, pauses: data.pauses, fromMs, volume: volRef.current });
      if (mine !== gen.current) return st.stop();
      station.current = st;
      if (!detector.current) detector.current = new TalkDetector((talking) => station.current?.setVoiceDuck(talking ? TALK_DUCK : 1));
      setPlaying(true);
    },
    [data, timelines, stopAll, radio]
  );

  // keep the voices on the replay's clock, and the position up to date
  useEffect(() => {
    if (!playing || !data || data === "missing") return;
    const t = setInterval(() => {
      const st = station.current;
      if (!st) return;
      const now = st.nowMs();
      setAt(now);
      if (now >= data.replay.endedAt) return stopAll();
      for (const v of data.voices) {
        const on = now >= v.start && now < v.end;
        let el = voices.current.get(v.key);
        if (!on) {
          if (el && !el.paused) el.pause();
          continue;
        }
        if (!el) {
          el = new Audio();
          el.crossOrigin = "anonymous";
          el.preload = "auto";
          el.src = fileUrl(v.key);
          voices.current.set(v.key, el);
          detector.current?.addElement(v.key, el);
        }
        el.volume = volRef.current;
        const want = (now - v.start) / 1000;
        if (Math.abs(el.currentTime - want) > 0.35) el.currentTime = want;
        if (el.paused) void el.play().catch(() => {});
      }
    }, 250);
    return () => clearInterval(t);
  }, [playing, data, stopAll]);

  useEffect(() => {
    station.current?.setVolume(volume);
    for (const el of voices.current.values()) el.volume = volume;
  }, [volume]);

  useEffect(
    () => () => {
      gen.current++;
      station.current?.stop();
      for (const el of voices.current.values()) el.pause();
      detector.current?.close();
    },
    []
  );

  if (data === "missing") {
    return (
      <main>
        <div className="offair">
          <h1 className="name">Replay not found</h1>
          <div className="rmeta">
            <Link href="/plus/radio">Back to the radio</Link>
          </div>
        </div>
      </main>
    );
  }
  const r = data?.replay;
  const total = r ? r.endedAt - r.startedAt : 0;
  const pos = drag ?? (r ? at - r.startedAt : 0);
  // both times as wide as the longest one, so the bar between them never changes width
  const timeW = `${clock(total).length}ch`;
  const letGo = () => {
    const d = dragRef.current;
    if (d === null || !r) return;
    setDrag(null);
    const ms = r.startedAt + d;
    setAt(ms);
    if (playing) void start(ms);
  };
  return (
    <main>
      <div className="rtop">
        {r?.art && <img className="glow" src={r.art} alt="" />}
        <div className="radio solo">
          {r?.art ? <img className="art" src={r.art} alt="" /> : <div className="art ph-art" />}
          <div>
            <h1 className="name">{r?.title ?? ""}</h1>
            <div className="by">{r ? dateFmt.format(new Date(r.startedAt)) : ""}</div>
            <div className="ctrl">
              {playing ? (
                <button className="btn main lg" onClick={stopAll}>
                  <I.Stop />
                  Pause
                </button>
              ) : (
                <button className="btn main lg" disabled={!timelines} onClick={() => void start(at)}>
                  <I.Play />
                  {pos > 1000 ? "Resume" : "Play"}
                </button>
              )}
              <span className="gap" />
              <Volume />
            </div>
            <div className="seek">
              <span className="t" style={{ width: timeW }}>
                {clock(pos)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.round(total / 1000))}
                value={Math.round(pos / 1000)}
                aria-label="Position in the show"
                onChange={(e) => setDrag(Number(e.target.value) * 1000)}
                onPointerUp={letGo}
                onKeyUp={letGo}
                onBlur={letGo}
                onTouchEnd={letGo}
              />
              <span className="t" style={{ width: timeW }}>
                {clock(total)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
