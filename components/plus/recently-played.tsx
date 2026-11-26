"use client";
// "Recently played" on the Radio page: a clock button beside the popout button opens the last 8 songs (a panel
// above the controls, a sheet from the bottom on phones). Nothing is fetched until it is opened: the running
// order file (R2, no database reads), the library list the page already has, and the server clock.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { recentlyPlayed, type RadioTimeline, type RecentSong } from "@/lib/radio/autodj";
import { loadLibrary, serverOffset } from "@/components/radio/use-on-air";
import { RADIO_FILES } from "@/components/radio/use-radio-source";
import * as I from "./icons";

const COUNT = 8;
const PHONE = "(max-width: 720px)";
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const small = (url: string) => url.replace(/\/\d+x\d+bb\.jpg$/, "/120x120bb.jpg");

async function load(): Promise<RecentSong[]> {
  const [library, skew, tl] = await Promise.all([
    loadLibrary(),
    serverOffset(),
    fetch(`${RADIO_FILES}/radio/autodj.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<RadioTimeline>) : null))
      .catch(() => null),
  ]);
  return recentlyPlayed(tl, library, Date.now() + skew, COUNT).map((s) => ({ ...s, at: s.at - skew }));
}

export function RecentlyPlayed({ songKey }: { songKey: string | null }) {
  const [open, setOpen] = useState(false);
  const [songs, setSongs] = useState<RecentSong[] | null>(null);
  const [phone, setPhone] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const set = () => setPhone(mq.matches);
    set();
    mq.addEventListener("change", set);
    setHost(wrap.current?.closest<HTMLElement>(".fp") ?? null);
    return () => mq.removeEventListener("change", set);
  }, []);

  // read when opened, and again when the song changes while it is open
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void load().then((s) => alive && setSongs(s));
    return () => {
      alive = false;
    };
  }, [open, songKey]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!songKey) return null;

  const list = (
    <div ref={panel} className={`recent${phone ? " sheet" : ""}`} role="dialog" aria-label="Recently played">
      <div className="rh">Recently played</div>
      {songs === null ? (
        <ol aria-busy="true">
          {Array.from({ length: COUNT }, (_, i) => (
            <li key={i}>
              <span className="ph" />
              <span className="t">
                <span className="a ph-line" />
                <span className="b ph-line" />
              </span>
            </li>
          ))}
        </ol>
      ) : songs.length ? (
        <ol>
          {songs.map((s) => (
            <li key={`${s.key}${s.at}`}>
              {s.art ? <img src={small(s.art)} alt="" referrerPolicy="no-referrer" /> : <span className="ph" />}
              <span className="t">
                <span className="a" title={s.title}>{s.title}</span>
                <span className="b">{s.artist}</span>
              </span>
              <time dateTime={new Date(s.at).toISOString()}>{timeFmt.format(new Date(s.at))}</time>
            </li>
          ))}
        </ol>
      ) : (
        <div className="none">Nothing yet.</div>
      )}
    </div>
  );

  return (
    <div className="recentwrap" ref={wrap}>
      <button ref={button} className="ib" aria-label="Recently played" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <I.History />
      </button>
      {open && !phone && list}
      {open && phone && host && createPortal(
        <>
          <div className="recentscrim" aria-hidden onClick={() => setOpen(false)} />
          {list}
        </>,
        host,
      )}
    </div>
  );
}
