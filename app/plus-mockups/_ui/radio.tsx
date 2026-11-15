"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { M } from "./cards";
import * as I from "./icons";
import { CallPanel, ListenButton, Lyrics, UseStation, Volume, Votes, useRadio } from "./shell";
import { SHOWS, type CallStep, type Mode } from "./station";

function Secondary({ popout = true }: { popout?: boolean }) {
  const r = useRadio();
  return (
    <>
      <span className="gap" />
      <Votes />
      <Volume />
      {popout && (
        <button className="ib" aria-label="Open in a popout window" onClick={r.popout}>
          <I.Pop />
        </button>
      )}
      <button className="ib" aria-label="Full screen" onClick={() => r.setFull(true)}>
        <I.Full />
      </button>
    </>
  );
}

function Shows() {
  return (
    <div className="rsec">
      <div className="rowh">
        <h2 className="h2">Shows</h2>
      </div>
      <div className="shows">
        {SHOWS.map((s) => (
          <Link key={s.name} href={`${M}/schedule`}>
            <img src={s.art} alt="" />
            <div className="n">{s.name}</div>
            {s.host && <div className="h">{s.host}</div>}
            <div className="w">{s.when}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function RadioPage({ mode, step }: { mode: Mode; step?: CallStep }) {
  const r = useRadio();
  const s = r.station;
  // Wait for the station to match the page, so the first paint isn't the previous state.
  const ready = s.mode === mode;
  return (
    <main>
      <UseStation mode={mode} step={step} />
      {ready && (
        <div className="rtop">
          {s.art && <img className="glow" src={s.art} alt="" />}
          {s.mode === "offair" ? (
            <div className="offair">
              <h1 className="name">Off air</h1>
              {s.next && <div className="rmeta">{s.next}</div>}
            </div>
          ) : (
            <div className={`radio${s.lyrics ? "" : " solo"}`}>
              {s.lyrics ? (
                <>
                  <div>
                    <img className="art" src={s.art!} alt="" />
                    <h1 className="name">{s.name}</h1>
                    <div className="by">{s.by}</div>
                    {s.song && (
                      <div className="song">
                        <I.Note />
                        {s.song}
                      </div>
                    )}
                    <div className="ctrl">
                      <ListenButton />
                      <Secondary />
                    </div>
                    <div className="rmeta">
                      {s.listeners} listening{s.next ? ` · ${s.next}` : ""}
                    </div>
                  </div>
                  <Lyrics lines={s.lyrics} />
                </>
              ) : (
                <>
                  <img className="art" src={s.art!} alt="" />
                  <div>
                    <h1 className="name">{s.name}</h1>
                    <div className="by">{s.by}</div>
                    <div className="ctrl">
                      <ListenButton />
                      <Secondary />
                    </div>
                    <div className="rmeta">
                      {s.listeners} listening{s.next ? ` · ${s.next}` : ""}
                    </div>
                    <CallPanel />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <Shows />
    </main>
  );
}

type Size = "tiny" | "small" | "tall";

/** The popout window: the same rules as the radio page, scaled to the window. */
export function PopoutPage() {
  const r = useRadio();
  const [mode, setMode] = useState<Mode | null>(null);
  const [size, setSize] = useState<Size>("tall");
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode") as Mode | null;
    setMode(m && ["autodj", "show", "hosted", "offair"].includes(m) ? m : "autodj");
    const fit = () => setSize(window.innerWidth < 220 ? "tiny" : window.innerHeight < 260 ? "small" : "tall");
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  if (!mode) return null;
  const s = r.station;
  return (
    <main className="popw">
      <UseStation mode={mode} listen />
      {s.art && <img className="glow" src={s.art} alt="" />}
      {size === "tiny" ? (
        <div className="inner" style={{ justifyContent: "space-between" }}>
          {s.art && <img className="art" src={s.art} alt="" style={{ width: 64, height: 64 }} />}
          <TinyStop />
        </div>
      ) : size === "small" ? (
        <div className="inner">
          {s.art && <img className="art" src={s.art} alt="" style={{ width: 88, height: 88 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "800 20px/1.1 var(--title)", letterSpacing: "-0.03em" }}>{s.name}</div>
            <div className="muted" style={{ fontSize: 14, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.mode === "show" ? s.song : s.by}
            </div>
          </div>
          <TinyStop />
        </div>
      ) : (
        <div className="tall">
          {s.art && <img className="art" src={s.art} alt="" />}
          <div className="name">{s.name}</div>
          <div className="by">{s.mode === "show" ? s.song : s.by}</div>
          <div className="ctrl" style={{ marginTop: 18 }}>
            <ListenButton big={false} />
            <span className="gap" />
            <Votes />
            <Volume />
          </div>
          <div className="rmeta">
            {s.listeners} listening{s.next ? ` · ${s.next}` : ""}
          </div>
          <CallPanel />
        </div>
      )}
    </main>
  );
}

function TinyStop() {
  const r = useRadio();
  return r.listening ? (
    <button className="stop" aria-label="Stop" onClick={r.stop}>
      <i />
    </button>
  ) : (
    <button className="stop" aria-label="Listen" onClick={r.listen}>
      <I.Play />
    </button>
  );
}

/** The FTN website, with the same player bar docked at the bottom. The page itself is a screenshot of ftn.euno.cc. */
export function SitePage() {
  return (
    <main style={{ background: "#ffbb14" }}>
      <UseStation mode="autodj" listen />
      <Link href={`${M}/home`} aria-label="Open FTN+">
        <img src="/mockups/plus/ftn-site.jpg" alt="The FTN website's home page" style={{ width: "100%", maxWidth: 1366, margin: "0 auto" }} />
      </Link>
    </main>
  );
}
