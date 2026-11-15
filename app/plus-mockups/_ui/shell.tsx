"use client";
// The FTN+ mockups' shared parts: radio state, the top bar, the phone tab bar, the player bar, full screen, lyrics
// and calling in. Nothing here plays audio or talks to the server; it only shows how the screens behave.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as I from "./icons";
import { STATIONS, type CallStep, type Mode, type Station } from "./station";

export const M = "/plus-mockups";

type Ctx = {
  mode: Mode;
  setMode: (m: Mode) => void;
  station: Station;
  listening: boolean;
  bar: boolean;
  listen: () => void;
  stop: () => void;
  closeBar: () => void;
  volume: number;
  setVolume: (v: number) => void;
  vote: "up" | "down" | null;
  setVote: (v: "up" | "down" | null) => void;
  full: boolean;
  setFull: (f: boolean) => void;
  call: CallStep;
  setCall: (s: CallStep) => void;
  signedIn: boolean;
  setSignedIn: (b: boolean) => void;
  queue: number;
  ducked: boolean;
  setDucked: (b: boolean) => void;
  line: number;
  popout: () => void;
};

const RadioCtx = createContext<Ctx | null>(null);
export function useRadio() {
  const c = useContext(RadioCtx);
  if (!c) throw new Error("useRadio outside the mockup shell");
  return c;
}

export function MockShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const [mode, setModeRaw] = useState<Mode>("autodj");
  const [listening, setListening] = useState(false);
  const [bar, setBar] = useState(false);
  const [volume, setVolume] = useState(70);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [full, setFull] = useState(false);
  const [call, setCall] = useState<CallStep>("button");
  const [signedIn, setSignedIn] = useState(false);
  const [queue, setQueue] = useState(3);
  const [ducked, setDucked] = useState(false);
  const [line, setLine] = useState(2);
  const station = STATIONS[mode];

  const modeRef = useRef<Mode>("autodj");
  const setMode = useCallback((m: Mode) => {
    if (modeRef.current !== m) {
      modeRef.current = m;
      setVote(null);
      setLine(2);
      setCall("button");
    }
    setModeRaw(m);
  }, []);
  const listen = useCallback(() => {
    setListening(true);
    setBar(true);
  }, []);
  const stop = useCallback(() => setListening(false), []);
  const closeBar = useCallback(() => {
    setListening(false);
    setBar(false);
  }, []);
  const popout = useCallback(() => {
    // Playback moves to the popout window, so this window stops.
    window.open(`${M}/popout?mode=${mode}`, "ftnplus-radio", "width=380,height=640");
    setListening(false);
    setBar(false);
    setFull(false);
  }, [mode]);

  // The lyrics follow the station's shared timeline, whether or not this person is listening.
  useEffect(() => {
    if (!station.lyrics) return;
    const n = station.lyrics.length;
    const t = setInterval(() => setLine((l) => (l + 1) % n), 3200);
    return () => clearInterval(t);
  }, [station.lyrics]);

  // In the queue, the caller moves up, then the host takes the call.
  useEffect(() => {
    if (call !== "waiting") return;
    const t = setInterval(() => {
      setQueue((q) => {
        if (q <= 1) {
          setCall("onair");
          return 3;
        }
        return q - 1;
      });
    }, 3500);
    return () => clearInterval(t);
  }, [call]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  // On the Radio page the page itself is the player, so the bar stays hidden there.
  const onRadio = pathname === `${M}/radio` || pathname.startsWith(`${M}/radio/`);
  const showBar = bar && !onRadio && !pathname.startsWith(`${M}/popout`);
  const chromeless = pathname.startsWith(`${M}/popout`) || pathname.startsWith(`${M}/site`) || pathname === M;
  const ctx: Ctx = { mode, setMode, station, listening, bar, listen, stop, closeBar, volume, setVolume, vote, setVote, full, setFull, call, setCall, signedIn, setSignedIn, queue, ducked, setDucked, line, popout };

  return (
    <RadioCtx.Provider value={ctx}>
      <div className={`fp${showBar ? " listening" : ""}${pathname.startsWith(`${M}/popout`) ? " pop" : ""}`}>
        {!chromeless && <TopBar pathname={pathname} />}
        {children}
        {showBar && <PlayerBar />}
        {!chromeless && <PhoneTabs pathname={pathname} />}
        {full && <FullScreen />}
      </div>
    </RadioCtx.Provider>
  );
}

/** Sets which radio state a mockup page shows, and opens a call step named in the address (#signin, #mic, #waiting, #onair, #closed). */
export function UseStation({ mode, listen, step }: { mode: Mode; listen?: boolean; step?: CallStep }) {
  const r = useRadio();
  useLayoutEffect(() => {
    r.setMode(mode);
    if (listen) r.listen();
    const hash = window.location.hash.slice(1) as CallStep;
    const s = step ?? (["signin", "mic", "waiting", "onair", "closed"].includes(hash) ? hash : null);
    if (s) {
      if (s !== "signin" && s !== "closed") r.setSignedIn(true);
      r.setCall(s);
      r.listen();
    }
    if (window.location.hash === "#full") r.setFull(true);
     
  }, [mode]);
  return null;
}

const NAV: [string, string][] = [
  ["Home", "/home"],
  ["Videos", "/videos"],
  ["Radio", "/radio"],
  ["Schedule", "/schedule"],
  ["Sports", "/sports"],
  ["Saved", "/saved"],
];

function current(pathname: string, href: string) {
  const p = M + href;
  return pathname === p || pathname.startsWith(p + "/") || (href === "/videos" && pathname.startsWith(`${M}/watch`));
}

function TopBar({ pathname }: { pathname: string }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`top${solid ? " solid" : ""}`}>
      <Link href={`${M}/home`} className="logo" aria-label="FTN+ home">
        { }
        <img src="/logos/ftnplus_textwhite_transparent.png" alt="FTN+" />
      </Link>
      <nav className="nav" aria-label="FTN+">
        {NAV.map(([label, href]) => (
          <Link key={href} href={M + href} aria-current={current(pathname, href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="right">
        <Link href={`${M}/site`} className="back">Back to FTN</Link>
        <span className="avatar" aria-label="Your account">A</span>
      </div>
    </header>
  );
}

function PhoneTabs({ pathname }: { pathname: string }) {
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);
  const tab = (label: string, href: string, Icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement) => (
    <Link href={M + href} aria-current={current(pathname, href) ? "page" : undefined}>
      <Icon />
      {label}
    </Link>
  );
  const inMore = current(pathname, "/sports") || current(pathname, "/saved");
  return (
    <>
      <div className={`moresheet${more ? " open" : ""}`}>
        <Link href={`${M}/sports`}>Sports</Link>
        <Link href={`${M}/saved`}>Saved</Link>
        <Link href={`${M}/site`}>Back to FTN</Link>
      </div>
      <nav className="tabsbar" aria-label="FTN+">
        {tab("Home", "/home", I.Home)}
        {tab("Videos", "/videos", I.Grid)}
        {tab("Radio", "/radio", I.Radio)}
        {tab("Schedule", "/schedule", I.Calendar)}
        <button aria-expanded={more} aria-current={inMore ? "page" : undefined} onClick={() => setMore((m) => !m)}>
          <I.More />
          More
        </button>
      </nav>
    </>
  );
}

export function Volume() {
  const r = useRadio();
  return (
    <label className="vol">
      <I.Vol />
      <input type="range" min={0} max={100} value={r.volume} aria-label="Volume" onChange={(e) => r.setVolume(+e.target.value)} style={{ ["--v" as string]: `${r.volume}%` }} />
    </label>
  );
}

export function Votes() {
  const r = useRadio();
  if (!r.station.vote) return null;
  return (
    <>
      <button className="ib fill" aria-label="Like this song" aria-pressed={r.vote === "up"} onClick={() => r.setVote(r.vote === "up" ? null : "up")}>
        <I.Up />
      </button>
      <button className="ib fill" aria-label="Dislike this song" aria-pressed={r.vote === "down"} onClick={() => r.setVote(r.vote === "down" ? null : "down")}>
        <I.Down />
      </button>
    </>
  );
}

/** Listen, which becomes Stop. There's no pause: Stop rejoins live next time. */
export function ListenButton({ big = true }: { big?: boolean }) {
  const r = useRadio();
  return r.listening ? (
    <button className={`btn main${big ? " lg" : ""}`} onClick={r.stop}>
      <I.Stop />
      Stop
    </button>
  ) : (
    <button className={`btn main${big ? " lg" : ""}`} onClick={r.listen}>
      <I.Play />
      Listen
    </button>
  );
}

function PlayerBar() {
  const r = useRadio();
  const s = r.station;
  const second = r.ducked && r.listening ? "Radio lowered while the video plays" : s.mode === "show" ? s.song : s.by;
  return (
    <div className="pbar" role="region" aria-label="Radio">
      <button className="open" onClick={() => r.setFull(true)} aria-label="Open the radio in full screen">
        { }
        {s.art && <img src={s.art} alt="" />}
        <span className="tx">
          <span className="a" style={{ display: "block" }}>{s.name}</span>
          <span className="b" style={{ display: "block" }}>{second}</span>
        </span>
      </button>
      <Volume />
      <button className="ib hide-phone" aria-label="Open in a popout window" onClick={r.popout}>
        <I.Pop />
      </button>
      <button className="ib hide-phone" aria-label="Full screen" onClick={() => r.setFull(true)}>
        <I.Full />
      </button>
      {r.listening ? (
        <button className="stop" aria-label="Stop" onClick={r.stop}>
          <i />
        </button>
      ) : (
        <button className="stop" aria-label="Listen" onClick={r.listen}>
          <I.Play />
        </button>
      )}
      <button className="ib hide-phone" aria-label="Close the radio" onClick={r.closeBar}>
        <I.Close />
      </button>
    </div>
  );
}

/** Synced lyrics: the current line bright and held a little above the middle. */
export function Lyrics({ lines }: { lines: string[] }) {
  const r = useRadio();
  const box = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(0);
  useLayoutEffect(() => {
    const el = rail.current?.children[r.line] as HTMLElement | undefined;
    const h = box.current?.clientHeight ?? 0;
    if (el) setY(h * 0.4 - el.offsetTop - el.offsetHeight / 2);
  }, [r.line, lines]);
  return (
    <div className="lyrics" ref={box} aria-label="Lyrics">
      <div className="rail" ref={rail} style={{ transform: `translateY(${y}px)` }}>
        {lines.map((l, i) => (
          <p key={i} className={i === r.line ? "now" : i < r.line ? "past" : undefined}>
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

function Meter({ live = true }: { live?: boolean }) {
  const [lvl, setLvl] = useState(6);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setLvl(3 + Math.round(Math.random() * 9)), 180);
    return () => clearInterval(t);
  }, [live]);
  return (
    <div className="meter" aria-hidden>
      {Array.from({ length: 16 }, (_, i) => (
        <i key={i} className={i < lvl ? "on" : undefined} />
      ))}
    </div>
  );
}

const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

/** Calling in. Each step replaces the Call in button, inside the player. */
export function CallPanel() {
  const r = useRadio();
  if (!r.station.calls && r.call !== "closed") return null;
  const begin = () => {
    r.listen();
    r.setCall(r.signedIn ? "mic" : "signin");
  };
  let body: React.ReactNode;
  switch (r.call) {
    case "button":
      return (
        <div className="call">
          <button className="btn sec" onClick={begin}>
            <I.Phone />
            Call in
          </button>
        </div>
      );
    case "signin":
      body = (
        <>
          <div className="t">Call in to {r.station.name}</div>
          <div className="s">Sign in with Roblox so the host knows who&apos;s calling.</div>
          <div className="acts">
            <button className="btn sec" onClick={() => { r.setSignedIn(true); r.setCall("mic"); }}>Sign in with Roblox</button>
            <button className="btn ghost" onClick={() => r.setCall("button")}>Just listen</button>
          </div>
        </>
      );
      break;
    case "mic":
      body = (
        <>
          <div className="t">Check your microphone</div>
          <Meter />
          <label className="select">
            Microphone
            <select defaultValue="default">
              <option value="default">Default</option>
              <option value="headset">Headset microphone</option>
            </select>
          </label>
          <div className="acts">
            <button className="btn sec" onClick={() => r.setCall("waiting")}>Join the queue</button>
            <button className="btn ghost" onClick={() => r.setCall("button")}>Cancel</button>
          </div>
        </>
      );
      break;
    case "waiting":
      body = (
        <>
          <div className="t">You&apos;re {ordinal(r.queue)} in line</div>
          <div className="s">You&apos;ll hear the show while you wait.</div>
          <Meter />
          <div className="acts">
            <button className="btn sec" onClick={() => r.setCall("button")}>Hang up</button>
          </div>
        </>
      );
      break;
    case "onair":
      body = <OnAir />;
      break;
    case "closed":
      body = (
        <>
          <div className="t">Calls are closed</div>
          <div className="s">The host isn&apos;t taking calls right now.</div>
          <div className="acts">
            <button className="btn ghost" style={{ paddingLeft: 0 }} onClick={() => r.setCall("button")}>OK</button>
          </div>
        </>
      );
      break;
  }
  return (
    <div className="call">
      <div className="callbox" role="group" aria-label="Calling in">{body}</div>
    </div>
  );
}

function OnAir() {
  const r = useRadio();
  const [muted, setMuted] = useState(false);
  return (
    <>
      <div className="t onair">You&apos;re on air</div>
      <Meter live={!muted} />
      <div className="acts">
        <button className="btn sec" aria-pressed={muted} onClick={() => setMuted((m) => !m)}>
          {muted ? <I.MicOff /> : <I.Mic />}
          {muted ? "Unmute" : "Mute"}
        </button>
        <button className="btn ghost" onClick={() => r.setCall("button")}>Hang up</button>
      </div>
    </>
  );
}

function FullScreen() {
  const r = useRadio();
  const s = r.station;
  const lyrics = s.lyrics;
  return (
    <div className="full" role="dialog" aria-modal="true" aria-label="Radio, full screen">
      { }
      {s.art && <img className="glow" src={s.art} alt="" />}
      <button className="ib corner" style={{ left: 20 }} aria-label="Close full screen" onClick={() => r.setFull(false)}>
        <I.Close />
      </button>
      <button className="ib corner" style={{ right: 20 }} aria-label="Open in a popout window" onClick={r.popout}>
        <I.Pop />
      </button>
      <div className={`grid${lyrics ? "" : " solo"}`}>
        <section aria-label="On air">
          { }
          {s.art && <img className="art" src={s.art} alt="" />}
          <div className="name">{s.name}</div>
          <div className="by">{s.mode === "show" ? s.song : s.by}</div>
          <div className="ctrl">
            <ListenButton big={false} />
            <span className="gap" />
            <Votes />
            <Volume />
          </div>
          <CallPanel />
        </section>
        {lyrics && <Lyrics lines={lyrics} />}
      </div>
    </div>
  );
}
