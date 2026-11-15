"use client";
// The radio as the approved mockups show it: the Radio page, full screen, the player bar (FTN+ and the FTN site)
// and the popout. What's on air comes from useOnAir (the AutoDJ's shared running order, or this browser's own
// player) and, during an OBS show on Icecast, from the now-playing poll and the schedule.
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRadio } from "@/components/radio/radio-provider";
import { useOnAir } from "@/components/radio/use-on-air";
import { useNowPlaying, type ShowInfo } from "@/components/radio/use-now-playing";
import { ListenButton, Volume } from "./radio-controls";
import * as I from "./icons";

// ---------------------------------------------------------------------------------------------- what's on air

export type StationView = {
  mode: "loading" | "autodj" | "hosted" | "offair";
  /** The big line: the song on the AutoDJ, the show during an OBS show. */
  name: string;
  /** Under it: the artist, or the host. */
  by: string;
  art: string | null;
  /** The AutoDJ song's file (votes and lyrics are keyed by it). */
  songKey: string | null;
  durationSec: number;
  /** Where the song is now, in seconds (null when unknown). */
  position: () => number | null;
  /** "Next: Ridgeway Review, Wednesday at 03:00". */
  next: string | null;
  /** Shown only when more than 2 people are listening at once. */
  listening: string | null;
};

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long" });
function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = same(d, today) ? null : same(d, tomorrow) ? "tomorrow" : dayFmt.format(d);
  return `${day ? `${day} ` : ""}at ${timeFmt.format(d)}`;
}
const nextLine = (s: ShowInfo | null | undefined) => (s ? `Next: ${s.name}, ${when(s.start)}` : null);

export function useStationView(enabled = true): StationView {
  const radio = useRadio();
  const onAir = useOnAir(enabled);
  const { info } = useNowPlaying(30_000, enabled);
  const positionNow = radio.positionNow;
  const playingHere = radio.source === "autodj" && radio.localStatus === "playing";
  const n = radio.status === "playing" ? radio.listeners : null;
  const listening = n != null && n > 2 ? `${n} listening` : null;
  const next = nextLine(info?.nextShow);

  return useMemo<StationView>(() => {
    const none = () => null;
    if (onAir.state === "loading") return { mode: "loading", name: "", by: "", art: null, songKey: null, durationSec: 0, position: none, next: null, listening: null };
    if (onAir.state === "off-air") return { mode: "offair", name: "Off air", by: "", art: null, songKey: null, durationSec: 0, position: none, next, listening: null };
    if (onAir.state === "icecast") {
      const show = info?.currentShow;
      const slot = show ? `${timeFmt.format(new Date(show.start))} to ${timeFmt.format(new Date(show.end))}` : null;
      return {
        mode: "hosted",
        name: show?.name ?? info?.track?.title ?? "On air",
        by: show ? [show.presenter ? `with ${show.presenter}` : null, slot].filter(Boolean).join(" · ") : info?.track?.artist ?? "",
        art: show?.artUrl ?? info?.artUrl ?? null,
        songKey: null,
        durationSec: 0,
        position: none,
        next,
        listening,
      };
    }
    const { positionSec, at } = onAir;
    return {
      mode: "autodj",
      name: onAir.title,
      by: onAir.artist,
      art: onAir.art,
      songKey: onAir.key,
      durationSec: onAir.durationSec,
      position: () => (playingHere ? positionNow() : positionSec == null ? null : positionSec + (Date.now() - at) / 1000),
      next,
      listening,
    };
  }, [onAir, info, next, listening, playingHere, positionNow]);
}

// ---------------------------------------------------------------------------------------------------- lyrics

type Lyric = { timeMs: number; text: string };
type LyricsModule = { findLyrics: (song: { key: string; title: string; artist: string; durationSec: number }) => Promise<{ synced: boolean; lines: Lyric[] } | null> };

let lyricsModule: Promise<LyricsModule> | null = null;
function loadLyricsModule() {
  // Built by radio-engine (BitChord's lookup), loaded at run time so the site's bundler leaves it alone.
  lyricsModule ??= import(/* webpackIgnore: true */ new URL("/radio-engine/lyrics.js", window.location.origin).href).catch((e) => {
    lyricsModule = null;
    throw e;
  });
  return lyricsModule;
}

const lyricsCache = new Map<string, Lyric[] | null>();

/** Timed lyrics for the song on air, or null (none found, not timed, or not the AutoDJ). */
export function useLyrics(v: StationView): Lyric[] | null {
  const key = v.mode === "autodj" ? v.songKey : null;
  const [got, setGot] = useState<{ key: string; lines: Lyric[] | null } | null>(null);
  const song = useRef(v);
  song.current = v;
  useEffect(() => {
    if (!key) return;
    if (lyricsCache.has(key)) return setGot({ key, lines: lyricsCache.get(key)! });
    let alive = true;
    const s = song.current;
    loadLyricsModule()
      .then((m) => m.findLyrics({ key, title: s.name, artist: s.by, durationSec: s.durationSec }))
      .then((found) => {
        const lines = found?.synced ? found.lines : null;
        lyricsCache.set(key, lines);
        if (alive) setGot({ key, lines });
      })
      .catch(() => alive && setGot({ key, lines: null }));
    return () => {
      alive = false;
    };
  }, [key]);
  return key && got?.key === key ? got.lines : null;
}

/** Synced lyrics: the current line bright and held a little above the middle. */
export function Lyrics({ lines, position }: { lines: Lyric[]; position: () => number | null }) {
  const box = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(-1);
  const [y, setY] = useState(0);
  useEffect(() => {
    const tick = () => {
      const p = position();
      if (p == null) return;
      const ms = p * 1000;
      let i = -1;
      for (let k = 0; k < lines.length; k++) if (lines[k]!.timeMs <= ms) i = k;
      setCur(i);
    };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [lines, position]);
  useLayoutEffect(() => {
    const el = rail.current?.children[Math.max(0, cur)] as HTMLElement | undefined;
    const h = box.current?.clientHeight ?? 0;
    if (el) setY(h * 0.4 - el.offsetTop - el.offsetHeight / 2);
  }, [cur, lines]);
  return (
    <div className="lyrics" ref={box} aria-label="Lyrics">
      <div className="rail" ref={rail} style={{ transform: `translateY(${y}px)` }}>
        {lines.map((l, i) => (
          <p key={i} className={i === cur ? "now" : i < cur ? "past" : undefined}>
            {l.text || "♪"}
          </p>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- votes

/** Like or dislike the song on air. No totals: listeners only see their own choice (counts are admin-only). */
export function Votes({ songKey }: { songKey: string | null }) {
  const [mine, setMine] = useState<{ key: string; v: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(songKey);
  keyRef.current = songKey;
  useEffect(() => {
    if (!songKey) return;
    let alive = true;
    // the server works the song out from the same running order; give it a moment past a song change
    const load = () =>
      fetch("/api/radio/vote")
        .then((r) => r.json())
        .then((d: any) => alive && d?.song?.key === songKey && setMine({ key: songKey, v: d.mine === 1 || d.mine === -1 ? d.mine : 0 }))
        .catch(() => {});
    const t = setTimeout(load, 1500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [songKey]);
  if (!songKey) return null;
  const v = mine?.key === songKey ? mine.v : 0;
  const cast = async (dir: 1 | -1) => {
    if (busy) return;
    const key = songKey;
    const value = v === dir ? 0 : dir;
    setBusy(true);
    setMine({ key, v: value });
    try {
      const r = await fetch("/api/radio/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
      const d: any = await r.json().catch(() => ({}));
      if (keyRef.current === key) setMine({ key, v: r.ok ? (d.mine === 1 || d.mine === -1 ? d.mine : 0) : v });
    } catch {
      if (keyRef.current === key) setMine({ key, v });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="ib fill" aria-label="Like this song" aria-pressed={v === 1} disabled={busy} onClick={() => cast(1)}>
        <I.Up />
      </button>
      <button className="ib fill" aria-label="Dislike this song" aria-pressed={v === -1} disabled={busy} onClick={() => cast(-1)}>
        <I.Down />
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- radio page

function Secondary({ v }: { v: StationView }) {
  const r = useRadio();
  return (
    <>
      <span className="gap" />
      <Votes songKey={v.songKey} />
      <Volume />
      <button className="ib" aria-label="Open in a popout window" onClick={r.popout}>
        <I.Pop />
      </button>
      <button className="ib" aria-label="Full screen" onClick={() => r.setFull(true)}>
        <I.Full />
      </button>
    </>
  );
}

const meta = (v: StationView) => [v.listening, v.next].filter(Boolean).join(" · ");

type Slot = { start: string; show: { id: string; name: string; presenter: string | null; artUrl: string | null } };
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" });

function Shows() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  useEffect(() => {
    fetch("/api/radio/schedule")
      .then((r) => r.json())
      .then((d: any) => setSlots(Array.isArray(d?.schedule) ? d.schedule : []))
      .catch(() => setSlots([]));
  }, []);
  const shows = useMemo(() => {
    const seen = new Map<string, Slot>();
    for (const s of slots ?? []) if (!seen.has(s.show.id)) seen.set(s.show.id, s);
    return [...seen.values()];
  }, [slots]);
  if (!shows.length) return null;
  return (
    <div className="rsec">
      <div className="rowh">
        <h2 className="h2">Shows</h2>
      </div>
      <div className="shows">
        {shows.map((s) => (
          <Link key={s.show.id} href="/plus/schedule">
            {s.show.artUrl ? <img src={s.show.artUrl} alt="" /> : <div className="ph-art" />}
            <div className="n">{s.show.name}</div>
            {s.show.presenter && <div className="h">with {s.show.presenter}</div>}
            <div className="w">
              {weekday.format(new Date(s.start))}s, {timeFmt.format(new Date(s.start))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function RadioPage() {
  const v = useStationView();
  const lyrics = useLyrics(v);
  return (
    <main>
      <div className="rtop">
        {v.art && <img className="glow" src={v.art} alt="" />}
        {v.mode === "loading" ? (
          <div className="radio solo" aria-label="Loading">
            <div className="art ph-box" />
          </div>
        ) : v.mode === "offair" ? (
          <div className="offair">
            <h1 className="name">Off air</h1>
            {v.next && <div className="rmeta">{v.next}</div>}
          </div>
        ) : lyrics ? (
          <div className="radio">
            <div>
              {v.art ? <img className="art" src={v.art} alt="" /> : <div className="art ph-art" />}
              <h1 className="name">{v.name}</h1>
              <div className="by">{v.by}</div>
              <div className="ctrl">
                <ListenButton />
                <Secondary v={v} />
              </div>
              {meta(v) && <div className="rmeta">{meta(v)}</div>}
            </div>
            <Lyrics lines={lyrics} position={v.position} />
          </div>
        ) : (
          <div className="radio solo">
            {v.art ? <img className="art" src={v.art} alt="" /> : <div className="art ph-art" />}
            <div>
              <h1 className="name">{v.name}</h1>
              <div className="by">{v.by}</div>
              <div className="ctrl">
                <ListenButton />
                <Secondary v={v} />
              </div>
              {meta(v) && <div className="rmeta">{meta(v)}</div>}
            </div>
          </div>
        )}
      </div>
      <Shows />
      <SourceLink />
    </main>
  );
}

/** The engine and lyrics are AGPL and GPL code: listeners are offered the source. */
export function SourceLink() {
  return (
    <div className="srclink">
      FTN Radio runs on open source code from BitChord and AutoMix, and so does this site.{" "}
      <a href="https://github.com/Evorsiooo/ftn-website" target="_blank" rel="noopener noreferrer">
        Source code
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- full screen

export function FullScreen() {
  const r = useRadio();
  const v = useStationView();
  const lyrics = useLyrics(v);
  const close = r.setFull;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="full" role="dialog" aria-modal="true" aria-label="Radio, full screen">
      {v.art && <img className="glow" src={v.art} alt="" />}
      <button className="ib corner" style={{ left: 20 }} aria-label="Close full screen" onClick={() => close(false)}>
        <I.Close />
      </button>
      <button className="ib corner" style={{ right: 20 }} aria-label="Open in a popout window" onClick={r.popout}>
        <I.Pop />
      </button>
      <div className={`grid${lyrics ? "" : " solo"}`}>
        <section aria-label="On air">
          {v.art ? <img className="art" src={v.art} alt="" /> : <div className="art ph-art" />}
          <div className="name">{v.name}</div>
          <div className="by">{v.by}</div>
          <div className="ctrl">
            <ListenButton big={false} />
            <span className="gap" />
            <Votes songKey={v.songKey} />
            <Volume />
          </div>
          {meta(v) && <div className="rmeta">{meta(v)}</div>}
        </section>
        {lyrics && <Lyrics lines={lyrics} position={v.position} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ player bar

export function PlayerBar() {
  const r = useRadio();
  const v = useStationView();
  const on = r.status !== "idle" && r.status !== "error" && r.status !== "off-air";
  const second = r.ducked && on ? "Radio lowered while the video plays" : v.by;
  return (
    <div className="pbar" role="region" aria-label="Radio">
      <button className="open" onClick={() => r.setFull(true)} aria-label="Open the radio in full screen">
        {v.art ? <img src={v.art} alt="" /> : <span className="ph-art" style={{ width: 48, height: 48, borderRadius: 8 }} />}
        <span className="tx">
          <span className="a" style={{ display: "block" }}>
            {v.name || "FTN Radio"}
          </span>
          <span className="b" style={{ display: "block" }}>
            {second}
          </span>
        </span>
      </button>
      <Volume />
      <button className="ib hide-phone" aria-label="Open in a popout window" onClick={r.popout}>
        <I.Pop />
      </button>
      <button className="ib hide-phone" aria-label="Full screen" onClick={() => r.setFull(true)}>
        <I.Full />
      </button>
      {on ? (
        <button className="stop" aria-label="Stop" onClick={r.stop}>
          <i />
        </button>
      ) : (
        <button className="stop" aria-label="Listen" onClick={() => r.play()}>
          <I.Play />
        </button>
      )}
      <button className="ib hide-phone" aria-label="Close the radio" onClick={r.dismissMini}>
        <I.Close />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------- popout

type Size = "tiny" | "small" | "tall";

/** The popout window: the same rules as the radio page, scaled to the window. */
export function PopoutPage() {
  const r = useRadio();
  const v = useStationView();
  const [size, setSize] = useState<Size>("tall");
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const fit = () => setSize(window.innerWidth < 220 ? "tiny" : window.innerHeight < 260 ? "small" : "tall");
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  // Opened with ?autoplay=1 from a window that was playing: playback moves here.
  const play = r.play;
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("autoplay") !== "1") return;
    const t = setTimeout(() => {
      Promise.resolve(play()).catch(() => setBlocked(true));
    }, 300);
    return () => clearTimeout(t);
  }, [play]);
  const on = r.status !== "idle" && r.status !== "error" && r.status !== "off-air";
  const stopBtn = on ? (
    <button className="stop" aria-label="Stop" onClick={r.stop}>
      <i />
    </button>
  ) : (
    <button className="stop" aria-label="Listen" onClick={() => r.play()}>
      <I.Play />
    </button>
  );
  return (
    <main className="popw">
      {v.art && <img className="glow" src={v.art} alt="" />}
      {size === "tiny" ? (
        <div className="inner" style={{ justifyContent: "space-between" }}>
          {v.art && <img className="art" src={v.art} alt="" style={{ width: 64, height: 64 }} />}
          {stopBtn}
        </div>
      ) : size === "small" ? (
        <div className="inner">
          {v.art && <img className="art" src={v.art} alt="" style={{ width: 88, height: 88 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "800 20px/1.1 var(--title)", letterSpacing: "-0.03em" }}>{v.name}</div>
            <div className="muted" style={{ fontSize: 14, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {v.by}
            </div>
          </div>
          {stopBtn}
        </div>
      ) : (
        <div className="tall">
          {v.art && <img className="art" src={v.art} alt="" />}
          <div className="name">{v.name}</div>
          <div className="by">{v.by}</div>
          <div className="ctrl" style={{ marginTop: 18 }}>
            {v.mode !== "offair" && <ListenButton big={false} />}
            <span className="gap" />
            <Votes songKey={v.songKey} />
            <Volume />
          </div>
          {meta(v) && <div className="rmeta">{meta(v)}</div>}
          {blocked && !on && <div className="rmeta">Your browser blocked autoplay. Press Listen to carry on.</div>}
        </div>
      )}
    </main>
  );
}
