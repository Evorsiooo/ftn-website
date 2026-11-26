"use client";
// Replays: past shows, listened back to on FTN+. A replay isn't one recorded file: it is rebuilt
// in the browser from the running orders that played (the same engine and mixes) and each
// person's recorded voice, so it sounds like the show did.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRadio, useReplay } from "@/components/radio/radio-provider";
import { loadReplay, songAt, songInfoAt, stageAt, type LoadedReplay } from "@/components/radio/use-replay-player";
import { LyricsView, useSongLyrics, type Playhead } from "./lyrics-view";
import * as I from "./icons";
import { Volume } from "./radio-controls";
import { Stage } from "./radio-ui";
import { useSavedReplay } from "./saved";

type ReplayItem = { id: string; title: string; show: string | null; art: string | null; startedAt: number; endedAt: number };

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dur = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
};

/** Past shows, newest first, read again whenever a show starts or ends. */
function useReplayList(): ReplayItem[] | null {
  const [list, setList] = useState<ReplayItem[] | null>(null);
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
            {/* the show's art as a square on a blurred copy of itself, as on the FTN+ home */}
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
            </div>
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

/** A replay as a video-style card: the show's square art on a blurred copy of itself, its length in the corner. */
export function ReplayCard({ r }: { r: Omit<ReplayItem, "show"> }) {
  return (
    <Link href={`/plus/radio/replays/${r.id}`} className="card">
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
  );
}

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
          <ReplayCard key={r.id} r={r} />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- player

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * One replay, laid out like the radio page: the art with the people on air and the song's lyrics beside it
 * (a green ring on whoever is talking), then the title, the song playing and the controls, and the scrub bar.
 * Playback is the site-wide replay player's, so it carries on in the player bar on other pages.
 */
export function ReplayPage({ id }: { id: string }) {
  const player = useReplay();
  const [data, setData] = useState<LoadedReplay | null | "missing">(null);
  // where this page's replay is while it isn't the one in the player
  const [localAt, setLocalAt] = useState(0);
  // while the scrub bar is held: where it's at (the replay only jumps there when it's let go)
  const [drag, setDrag] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  dragRef.current = drag;
  const mine = player.current?.replay.id === id;

  useEffect(() => {
    let alive = true;
    setData(null);
    loadReplay(id)
      .then((d) => {
        if (!alive) return;
        setData(d);
        if (d === "missing") return;
        // ?t=<seconds> opens the replay at that point of the show (radio clips link to their moment)
        const t = Number(new URLSearchParams(window.location.search).get("t"));
        const from = Number.isFinite(t) && t > 0 ? Math.min(d.replay.endedAt - 1000, d.replay.startedAt + t * 1000) : d.replay.startedAt;
        setLocalAt(from);
      })
      .catch(() => alive && setData("missing"));
    return () => {
      alive = false;
    };
  }, [id]);

  const r = data && data !== "missing" ? data.replay : null;
  const { saved, toggle } = useSavedReplay(r);

  // the song at the playhead (or where the scrub bar is held), and its lyrics, as on the live radio
  const mineNow = player.current?.replay.id === id;
  const playingNow = mineNow && player.playing;
  const atMs = r ? (drag !== null ? r.startedAt + drag : mineNow ? player.at : localAt) : 0;
  const songNow = data && data !== "missing" ? songInfoAt(data, atMs) : null;
  const lyrics = useSongLyrics(songNow);
  const lyricKey = songNow?.key ?? null;
  const stillAt = songNow?.positionSec ?? null;
  const lyricsAt = useRef<() => Playhead>(() => null);
  lyricsAt.current = () => {
    if (playingNow && drag === null) {
      const p = player.playheadNow();
      return p && p.key === lyricKey ? { sec: p.sec, paused: false } : null;
    }
    // paused, or the scrub bar held: the lyrics wait on that moment of the song
    return stillAt === null ? null : { sec: stillAt, paused: true };
  };
  const readLyricsAt = useRef(() => lyricsAt.current()).current;

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
  const loaded = data;
  const playing = mine && player.playing;
  const at = mine ? player.at : localAt;
  const total = r ? r.endedAt - r.startedAt : 0;
  const pos = drag ?? (r ? at - r.startedAt : 0);
  // what was on air at the playhead (or where the scrub bar is held): the people and the song
  const showMs = r ? r.startedAt + pos : 0;
  const people = loaded ? stageAt(loaded, showMs, playing ? player.speaking : []) : [];
  const song = loaded ? songAt(loaded, showMs) : null;
  // both times as wide as the longest one, so the bar between them never changes width
  const timeW = `${clock(total).length}ch`;
  const letGo = () => {
    const d = dragRef.current;
    if (d === null || !r) return;
    setDrag(null);
    const ms = r.startedAt + d;
    if (mine) player.seek(ms);
    else setLocalAt(ms);
  };
  return (
    <main>
      <div className="rtop">
        {r?.art && <img className="glow" src={r.art} alt="" />}
        {/* the radio page's layout: the art with the people on air beside it, then the title, the
            song playing and the controls in one wide row, the scrub bar under them */}
        <div className="radio replay">
          <div className="artcol">{r?.art ? <img className="art" src={r.art} alt="" /> : <div className="art ph-art" />}</div>
          <div className={`side${people.length ? " staged" : ""}`}>
            {people.length > 0 && <Stage people={people} />}
            {lyrics && (
              <div className={people.some((p) => p.talking) ? "dim" : undefined}>
                <LyricsView key={lyrics.key} ttml={lyrics.ttml} offsetMs={lyrics.offsetMs} playhead={readLyricsAt} />
              </div>
            )}
          </div>
          <div className="info">
            <div className="txt">
              <h1 className="name" title={r?.title}>
                {r?.title ?? ""}
              </h1>
              <div className="by">{r ? dateFmt.format(new Date(r.startedAt)) : ""}</div>
              {song && (
                <div className="song">
                  <I.Note />
                  {song}
                </div>
              )}
            </div>
            <div className="ctrl">
              {playing ? (
                <button className="btn main lg" onClick={player.pause}>
                  <I.Stop />
                  Pause
                </button>
              ) : (
                <button className="btn main lg" disabled={!loaded} onClick={() => void player.play(id, at >= (r?.endedAt ?? 0) - 1000 ? r!.startedAt : at)}>
                  <I.Play />
                  {pos > 1000 && pos < total - 1000 ? "Resume" : "Play"}
                </button>
              )}
              <button className="btn sec lg" aria-pressed={saved} disabled={!r} onClick={toggle}>
                {saved ? <I.Saved /> : <I.Save />}
                {saved ? "Saved" : "Save"}
              </button>
              <span className="gap" />
              <Volume />
            </div>
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
    </main>
  );
}

/** The player bar while a replay is in the player, on every other page (like the radio's). */
export function ReplayBar() {
  const player = useReplay();
  const d = player.current;
  if (!d) return null;
  const r = d.replay;
  const song = songAt(d, player.at);
  return (
    <div className="pbar" role="region" aria-label="Radio replay">
      <Link className="open" href={`/plus/radio/replays/${r.id}`} aria-label={`Open the replay of ${r.title}`}>
        {r.art ? <img src={r.art} alt="" /> : <span className="ph-art" style={{ width: 48, height: 48, borderRadius: 8 }} />}
        <span className="tx">
          <span className="a" style={{ display: "block" }}>
            {r.title}
          </span>
          <span className="b" style={{ display: "block" }}>
            {song ?? `Replay · ${dateFmt.format(new Date(r.startedAt))}`}
          </span>
        </span>
      </Link>
      <Volume />
      {player.playing ? (
        <button className="stop" aria-label="Pause" onClick={player.pause}>
          <i />
        </button>
      ) : (
        <button className="stop" aria-label="Play" onClick={() => void player.play(r.id, player.at >= r.endedAt - 1000 ? r.startedAt : player.at)}>
          <I.Play />
        </button>
      )}
      <button className="ib hide-phone" aria-label="Close the replay" onClick={player.close}>
        <I.Close />
      </button>
    </div>
  );
}
