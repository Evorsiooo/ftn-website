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
import { CallIn } from "./call-in";
import { Replays } from "./replays";
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
  /** The song itself (the big line shows the show during a show). */
  songTitle: string;
  songArtist: string;
  /** During a show: "Song · Artist" under the show's name. */
  song: string | null;
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

const slotLine = (start: number, end: number) => `${timeFmt.format(new Date(start))} to ${timeFmt.format(new Date(end))}`;

export function useStationView(enabled = true): StationView {
  const radio = useRadio();
  const studio = radio.program?.studio ?? null;
  const airing = radio.airing;
  const onAir = useOnAir(enabled);
  const { info } = useNowPlaying(30_000, enabled);
  const positionNow = radio.positionNow;
  const playingHere = radio.source === "autodj" && radio.localStatus === "playing";
  const n = radio.status === "playing" ? radio.listeners : null;
  const listening = n != null && n > 2 ? `${n} listening` : null;
  const next = nextLine(info?.nextShow);

  return useMemo<StationView>(() => {
    const none = () => null;
    const blank = { songKey: null, songTitle: "", songArtist: "", song: null, durationSec: 0, position: none };
    if (radio.source === "stream" && airing) {
      return { ...blank, mode: "hosted", name: airing.title, by: slotLine(airing.start, airing.end), art: airing.art, next, listening };
    }
    if (onAir.state === "loading") return { ...blank, mode: "loading", name: "", by: "", art: null, next: null, listening: null };
    if (onAir.state === "off-air") return { ...blank, mode: "offair", name: "Off air", by: "", art: null, next, listening: null };
    if (onAir.state === "icecast") {
      const show = info?.currentShow;
      const slot = show ? `${timeFmt.format(new Date(show.start))} to ${timeFmt.format(new Date(show.end))}` : null;
      return {
        mode: "hosted",
        name: show?.name ?? info?.track?.title ?? "On air",
        by: show ? [show.presenter ? `with ${show.presenter}` : null, slot].filter(Boolean).join(" · ") : info?.track?.artist ?? "",
        art: show?.artUrl ?? info?.artUrl ?? null,
        ...blank,
        next,
        listening,
      };
    }
    const { positionSec, at } = onAir;
    // a Studio show, or a scheduled show the AutoDJ plays: the show is the big line, the song under it
    const hosts = studio?.voices.filter((p) => p.role !== "caller").map((p) => p.name) ?? [];
    const showName = studio?.title ?? (airing && airing.plays !== "stream" ? airing.title : null);
    const showBy = studio ? (hosts.length ? `with ${hosts.join(", ")}` : "") : airing ? slotLine(airing.start, airing.end) : "";
    const songLine = `${onAir.title} · ${onAir.artist}`;
    return {
      mode: "autodj",
      name: showName ?? onAir.title,
      by: showName ? showBy : onAir.artist,
      art: (showName ? studio?.art ?? airing?.art : null) ?? onAir.art,
      song: showName ? (studio?.pausedAt ? null : songLine) : null,
      songTitle: onAir.title,
      songArtist: onAir.artist,
      songKey: onAir.key,
      durationSec: onAir.durationSec,
      position: () => (playingHere ? positionNow() : positionSec == null ? null : positionSec + (Date.now() - at) / 1000),
      next,
      listening,
    };
  }, [onAir, info, next, listening, playingHere, positionNow, radio.source, studio, airing]);
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
      .then((m) => m.findLyrics({ key, title: s.songTitle, artist: s.songArtist, durationSec: s.durationSec }))
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

/** Synced lyrics: the current line bright and held a little above the middle. Opens on the line being sung
 *  (no scroll from the top), and only scrolls smoothly once placed. Key it by song so each song fades in. */
export function Lyrics({ lines, position }: { lines: Lyric[]; position: () => number | null }) {
  const box = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const find = () => {
    const p = position();
    if (p == null) return null;
    const ms = p * 1000;
    let i = -1;
    for (let k = 0; k < lines.length; k++) if (lines[k]!.timeMs <= ms) i = k;
    return i;
  };
  // null until the position is known: nothing is shown before the rail is in place
  const [cur, setCur] = useState<number | null>(find);
  const [y, setY] = useState(0);
  const [smooth, setSmooth] = useState(false);
  useEffect(() => {
    const tick = () => {
      const i = find();
      if (i != null) setCur(i);
    };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [lines, position]);
  useLayoutEffect(() => {
    if (cur == null) return;
    const el = rail.current?.children[Math.max(0, cur)] as HTMLElement | undefined;
    const h = box.current?.clientHeight ?? 0;
    if (el) setY(h * 0.4 - el.offsetTop - el.offsetHeight / 2);
  }, [cur, lines]);
  // Turn the scroll animation on only after the first placement has been painted.
  const placed = cur != null;
  useEffect(() => {
    if (!placed || smooth) return;
    let b = 0;
    const a = requestAnimationFrame(() => (b = requestAnimationFrame(() => setSmooth(true))));
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [placed, smooth]);
  return (
    <div className={`lyrics${placed ? " in" : ""}`} ref={box} aria-label="Lyrics">
      <div className={`rail${smooth ? "" : " still"}`} ref={rail} style={{ transform: `translateY(${y}px)` }}>
        {lines.map((l, i) => (
          <p key={i} className={cur == null ? undefined : i === cur ? "now" : i < cur ? "past" : undefined}>
            {l.text || "\u266a"}
          </p>
        ))}
      </div>
    </div>
  );
}

/** An image that crossfades to the next one once it has loaded, instead of switching at once. */
export function FadeImg({ src, className }: { src: string | null; className: string }) {
  const [layers, setLayers] = useState<{ src: string; shown: boolean }[]>(() => (src ? [{ src, shown: true }] : []));
  useEffect(() => {
    setLayers((ls) => {
      if (!src) return [];
      if (ls[ls.length - 1]?.src === src) return ls;
      return [...ls.filter((l) => l.shown).slice(-1), { src, shown: false }];
    });
  }, [src]);
  const loaded = (s: string) => {
    setLayers((ls) => ls.map((l) => (l.src === s ? { ...l, shown: true } : l)));
    // the old picture stays under the new one until the fade is over
    setTimeout(() => setLayers((ls) => (ls.length > 1 && ls[ls.length - 1]!.shown ? ls.slice(-1) : ls)), 700);
  };
  return (
    <div className={`${className} xf`} aria-hidden>
      {layers.map((l) => (
        <img
          key={l.src}
          src={l.src}
          alt=""
          className={l.shown ? "on" : undefined}
          ref={(el) => {
            if (el && !l.shown && el.complete && el.naturalWidth) loaded(l.src);
          }}
          onLoad={() => !l.shown && loaded(l.src)}
        />
      ))}
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

// ------------------------------------------------------------------------------------------- on stage

type OnStage = { id: string; name: string; avatar: string | null; talking: boolean };

/** The people on air in a Studio show, with who is talking now. */
export function useOnStage(): OnStage[] {
  const r = useRadio();
  const voices = r.program?.studio?.voices ?? [];
  const talking = new Set(r.speaking);
  return voices.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, talking: talking.has(p.id) }));
}

/**
 * Who's on air, Discord-style: each person's avatar with their name under it, a green ring
 * while they talk. Above the lyrics, which dim while someone talks over the music.
 */
function Stage({ people }: { people: OnStage[] }) {
  return (
    <ul className="stage" aria-label="On air">
      {people.map((p) => (
        <li key={p.id} className={p.talking ? "talk" : undefined} aria-label={p.talking ? `${p.name}, talking` : p.name}>
          {p.avatar ? <img src={p.avatar} alt="" /> : <span className="ini">{p.name.slice(0, 1).toUpperCase()}</span>}
          <span className="nm">{p.name}</span>
        </li>
      ))}
    </ul>
  );
}

function Side({ songKey, lyrics, people, position }: { songKey?: string | null; lyrics: Lyric[] | null; people: OnStage[]; position: () => number | null }) {
  const anyoneTalking = people.some((p) => p.talking);
  return (
    <div className={`side${people.length ? " staged" : ""}`}>
      {people.length > 0 && <Stage people={people} />}
      {lyrics && (
        <div className={anyoneTalking ? "dim" : undefined}>
          <Lyrics key={songKey ?? undefined} lines={lyrics} position={position} />
        </div>
      )}
    </div>
  );
}

/** During a show: the song playing, under the show's name. */
function SongLine({ v }: { v: StationView }) {
  if (!v.song) return null;
  return (
    <div className="song">
      <I.Note />
      {v.song}
    </div>
  );
}

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
  const people = useOnStage();
  return (
    <main>
      <div className="rtop">
        <FadeImg className="glow" src={v.art} />
        {v.mode === "offair" ? (
          <div className="offair">
            <h1 className="name">Off air</h1>
            {v.next && <div className="rmeta">{v.next}</div>}
          </div>
        ) : (
          // One layout with or without lyrics: the song under its art, the lyrics (when there are some) beside it,
          // level with the art's top and bottom.
          <div className="radio">
            <div>
              {v.mode === "loading" ? <div className="art ph-box" aria-label="Loading" /> : v.art ? <FadeImg className="art" src={v.art} /> : <div className="art ph-art" />}
              {v.mode !== "loading" && (
                <>
                  <h1 className="name swap" key={`n${v.songKey ?? v.name}`}>
                    {v.name}
                  </h1>
                  <div className="by swap" key={`b${v.songKey ?? v.name}`}>
                    {v.by}
                  </div>
                  <SongLine v={v} />
                  <div className="ctrl">
                    <ListenButton />
                    <Secondary v={v} />
                  </div>
                  {meta(v) && <div className="rmeta">{meta(v)}</div>}
                  <CallIn />
                </>
              )}
            </div>
            {(lyrics || people.length > 0) && <Side songKey={v.songKey} lyrics={lyrics} people={people} position={v.position} />}
          </div>
        )}
      </div>
      <Shows />
      <Replays />
    </main>
  );
}

// ---------------------------------------------------------------------------------------------- full screen

export function FullScreen() {
  const r = useRadio();
  const v = useStationView();
  const lyrics = useLyrics(v);
  const people = useOnStage();
  const close = r.setFull;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="full" role="dialog" aria-modal="true" aria-label="Radio, full screen">
      <FadeImg className="glow" src={v.art} />
      <button className="ib corner" style={{ left: 20 }} aria-label="Close full screen" onClick={() => close(false)}>
        <I.Close />
      </button>
      <button className="ib corner" style={{ right: 20 }} aria-label="Open in a popout window" onClick={r.popout}>
        <I.Pop />
      </button>
      <div className={`grid${lyrics || people.length ? "" : " solo"}`}>
        <section aria-label="On air">
          {v.art ? <FadeImg className="art" src={v.art} /> : <div className="art ph-art" />}
          <div className="name">{v.name}</div>
          <div className="by">{v.by}</div>
          <SongLine v={v} />
          <div className="ctrl">
            <ListenButton big={false} />
            <span className="gap" />
            <Votes songKey={v.songKey} />
            <Volume />
          </div>
          {meta(v) && <div className="rmeta">{meta(v)}</div>}
        </section>
        {(lyrics || people.length > 0) && <Side songKey={v.songKey} lyrics={lyrics} people={people} position={v.position} />}
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
      <FadeImg className="glow" src={v.art} />
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
          {v.art && <FadeImg className="art" src={v.art} />}
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
