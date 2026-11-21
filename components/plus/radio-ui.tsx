"use client";
// The radio as the approved mockups show it: the Radio page, full screen, the player bar (FTN+ and the FTN site)
// and the popout. What's on air comes from useOnAir (the AutoDJ's shared running order, or this browser's own
// player) and, during an OBS show on Icecast, from the now-playing poll and the schedule.
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRadio } from "@/components/radio/radio-provider";
import { useOnAir } from "@/components/radio/use-on-air";
import { useNowPlaying, type ShowInfo } from "@/components/radio/use-now-playing";
import { ListenButton, Volume } from "./radio-controls";
import { CallInButton, CallInCard, CallInProvider, useCallInOpen } from "./call-in";
import { Replays } from "./replays";
import { LyricsView, useSongLyrics, type Playhead, type SongLyrics } from "./lyrics-view";
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
  /** Where the song is now, read when asked (the lyrics read it every frame); null when unknown. While this
   *  browser plays the radio, the engine's own playhead (what is heard right now). */
  position: () => Playhead;
  /** A Studio host has paused the music. */
  musicPaused: boolean;
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
  const playheadNow = radio.playheadNow;
  const playingHere = radio.source === "autodj" && radio.localStatus === "playing";
  const n = radio.status === "playing" ? radio.listeners : null;
  const listening = n != null && n > 2 ? `${n} listening` : null;
  const next = nextLine(info?.nextShow);

  return useMemo<StationView>(() => {
    const none = () => null;
    const blank = { songKey: null, songTitle: "", songArtist: "", song: null, durationSec: 0, position: none, musicPaused: false };
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
    const key = onAir.key;
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
      position: () => {
        if (!playingHere) return positionSec == null ? null : { sec: positionSec + (Date.now() - at) / 1000, paused: false };
        const p = playheadNow();
        return p && p.key === key ? { sec: p.sec, paused: false } : null;
      },
      musicPaused: !!studio?.pausedAt,
      next,
      listening,
    };
  }, [onAir, info, next, listening, playingHere, playheadNow, radio.source, studio, airing]);
}

// ---------------------------------------------------------------------------------------------------- lyrics

/** The lyrics of the song on air (components/plus/lyrics-view.tsx): every song the radio plays from its running
 *  order (the AutoDJ, scheduled shows and Studio shows alike), hidden while a Studio host has the music paused. */
export function useLyrics(v: StationView): SongLyrics | null {
  const on = v.mode === "autodj" && !!v.songKey && !v.musicPaused;
  return useSongLyrics(on ? { key: v.songKey!, title: v.songTitle, artist: v.songArtist, durationSec: v.durationSec } : null);
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

export type OnStage = { id: string; name: string; avatar: string | null; talking: boolean };

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
export function Stage({ people }: { people: OnStage[] }) {
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

function Side({ lyrics, people, position }: { lyrics: SongLyrics | null; people: OnStage[]; position: () => Playhead }) {
  const anyoneTalking = people.some((p) => p.talking);
  // the call-in card takes the lyrics' place while it's open (the column keeps its size)
  const calling = useCallInOpen();
  const callable = !!useRadio().program?.studio?.callIn || calling;
  return (
    <div className={`side${people.length ? " staged" : ""}${callable ? " callable" : ""}`}>
      {people.length > 0 && <Stage people={people} />}
      <CallInCard />
      {lyrics && !calling && (
        <div className={anyoneTalking ? "dim" : undefined}>
          <LyricsView key={lyrics.key} ttml={lyrics.ttml} offsetMs={lyrics.offsetMs} playhead={position} />
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

type Slot = { slotId: string; start: string; show: { id: string; name: string; presenter: string | null; artUrl: string | null } };
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
    // one card per airing (a show can have several, each with its own title), at its next time
    for (const s of slots ?? []) if (!seen.has(s.slotId)) seen.set(s.slotId, s);
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
          <Link key={s.slotId} href="/plus/schedule">
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

/** The player sits centred in the window. Opening the call-in card makes it taller, which would
 *  re-centre it and move everything up (phones, where the card goes under the player), so while the
 *  card is open the player keeps the top it had when the card was closed. */
function RadioGrid({ children }: { children: ReactNode }) {
  const calling = useCallInOpen();
  const ref = useRef<HTMLDivElement>(null);
  const top = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!calling) {
      el.style.removeProperty("align-content");
      el.style.removeProperty("padding-top");
      const first = el.firstElementChild as HTMLElement | null;
      top.current = first ? first.offsetTop : null;
    } else if (top.current !== null) {
      el.style.setProperty("align-content", "start");
      el.style.setProperty("padding-top", `${top.current}px`);
    }
  });
  useEffect(() => {
    if (calling) return;
    const measure = () => {
      const first = ref.current?.firstElementChild as HTMLElement | null | undefined;
      if (first) top.current = first.offsetTop;
    };
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, [calling]);
  return (
    <div className="radio" ref={ref}>
      {children}
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
          // The art with the lyrics (and the people on air) beside it, then one wide row under both:
          // the title and artist on the left, every control on the right. All of it fits the window,
          // so nothing needs a scroll.
          <CallInProvider>
            <RadioGrid>
              <div className="artcol">{v.mode === "loading" ? <div className="art ph-box" aria-label="Loading" /> : v.art ? <FadeImg className="art" src={v.art} /> : <div className="art ph-art" />}</div>
              <Side lyrics={lyrics} people={people} position={v.position} />
              {v.mode !== "loading" && (
                <div className="info">
                  <div className="txt">
                    <h1 className="name swap" key={`n${v.songKey ?? v.name}`} title={v.name}>
                      {v.name}
                    </h1>
                    <div className="by swap" key={`b${v.songKey ?? v.name}`}>
                      {v.by}
                    </div>
                    <SongLine v={v} />
                    {meta(v) && <div className="rmeta">{meta(v)}</div>}
                  </div>
                  <div className="ctrl">
                    <ListenButton />
                    <CallInButton />
                    <Secondary v={v} />
                  </div>
                </div>
              )}
            </RadioGrid>
          </CallInProvider>
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
        {(lyrics || people.length > 0) && <Side lyrics={lyrics} people={people} position={v.position} />}
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
