"use client";
// The radio's lyrics, as BitChord's web app does them (web/app/src/shell/LyricsPanel.tsx): BitChord's lookup, its
// LyricClock moving the lyrics every frame, and am-lyrics (the same version) drawing them word by word, with
// background vocals, duet sides and the dots in instrumental gaps. Only the look is FTN+'s own (DM Sans, FTN+
// cream on the warm black), laid over am-lyrics the way BitChord lays its own over it.
//
// Every listener sees the same lyrics: the provider and offset for a song are chosen once, in the admin
// (Library > a song > Lyrics), where BitChord leaves them to each listener.
import { useEffect, useRef, useState } from "react";

// ------------------------------------------------------------------------------------------- the module

export type SourceState = "pending" | "found" | "missing";
export type FoundLyrics = { sourceId: string; source: string; synced: boolean; wordSynced: boolean; ttml: string; lines: { timeMs: number; text: string }[] };
type LyricClock = { displayedMs: number; restart(): void; hold(positionMs: number, nowMs: number): void; frame(nowMs: number, reportedMs: number, sampledAtMs: number, discontinuity: number): number };
export type LyricsModule = {
  findLyrics: (
    song: { key: string; title: string; artist: string; durationSec: number; album?: string | null },
    opts?: { only?: string | null; onSource?: (source: string, state: SourceState) => void }
  ) => Promise<FoundLyrics | null>;
  lyricSources: { id: string; label: string; detail: string; wordSynced: boolean }[];
  LyricClock: new (startMs: number) => LyricClock;
};

let lyricsModule: Promise<LyricsModule> | null = null;
/** Built by radio-engine (BitChord's lookup, LyricClock and am-lyrics), loaded at run time so the site's bundler
 *  leaves it alone. Loading it registers <am-lyrics>. */
export function loadLyricsModule(): Promise<LyricsModule> {
  const url = new URL(`/radio-engine/lyrics.js?v=${process.env.RADIO_ENGINE_VERSION ?? ""}`, window.location.origin).href;
  lyricsModule ??= import(/* webpackIgnore: true */ url).catch((e) => {
    lyricsModule = null;
    throw e;
  });
  return lyricsModule;
}

// -------------------------------------------------------------------------------- the admin's choices

export type LyricsChoice = { source: string | null; offsetMs: number };
const CHOICES_TTL_MS = 60_000;
let choices: { at: number; map: Promise<Record<string, LyricsChoice>> } | null = null;
/** Every song's provider and offset as set in the admin (only songs that have one), fetched again after a minute. */
function loadChoices(): Promise<Record<string, LyricsChoice>> {
  if (!choices || Date.now() - choices.at > CHOICES_TTL_MS) {
    const map = fetch("/api/radio/lyrics-choices")
      .then((r) => (r.ok ? r.json() : { choices: {} }))
      .then((b: any) => (b && typeof b.choices === "object" && b.choices ? (b.choices as Record<string, LyricsChoice>) : {}))
      .catch(() => ({}));
    // a failed fetch is tried again with the next song, not kept for a minute
    choices = { at: Date.now(), map };
    void map.then((m) => {
      if (!Object.keys(m).length && choices?.map === map) choices.at = 0;
    });
  }
  return choices.map;
}

// ---------------------------------------------------------------------------------- a song's lyrics

export type SongLyrics = { key: string; ttml: string; offsetMs: number };
export type LyricsSong = { key: string; title: string; artist: string; durationSec: number };

const found = new Map<string, FoundLyrics | null>();

/** Synced lyrics for [song] (null: none found, not timed, set to "no lyrics" in the admin, or no song). */
export function useSongLyrics(song: LyricsSong | null): SongLyrics | null {
  const key = song?.key ?? null;
  const [got, setGot] = useState<{ key: string; lyrics: SongLyrics | null } | null>(null);
  const songRef = useRef(song);
  songRef.current = song;
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const s = songRef.current!;
    void (async () => {
      try {
        const choice = (await loadChoices())[key] ?? { source: null, offsetMs: 0 };
        if (choice.source === "none") return alive && setGot({ key, lyrics: null });
        const cacheKey = `${key}|${choice.source ?? ""}`;
        let lyrics = found.get(cacheKey);
        if (lyrics === undefined) {
          const m = await loadLyricsModule();
          lyrics = await m.findLyrics({ key, title: s.title, artist: s.artist, durationSec: s.durationSec }, { only: choice.source });
          found.set(cacheKey, lyrics);
        }
        if (alive) setGot({ key, lyrics: lyrics?.synced ? { key, ttml: lyrics.ttml, offsetMs: choice.offsetMs } : null });
      } catch {
        if (alive) setGot({ key, lyrics: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [key]);
  return key && got?.key === key ? got.lyrics : null;
}

// -------------------------------------------------------------------------------------- the drawing

type AmLyricsElement = HTMLElement & {
  currentTime: number;
  ttml?: string;
  interpolate: boolean;
  autoScroll: boolean;
  noAutoAlternates: boolean;
  highlightColor: string;
  fontFamily?: string;
  updateComplete?: Promise<unknown>;
};

/**
 * Laid over am-lyrics (BitChord's LyricsPanel does the same with its own):
 * - its footer (source, "Switch", a GitHub link) stays in the layout, only unseen: am-lyrics measures its scroll
 *   range to it (BitChord's HIDE_FOOTER);
 * - its toolbar (romanisation, translation, download) is left out: no translation or romanisation on the radio;
 * - lines can't be clicked on the radio: nobody can move a shared radio to a line (BitChord seeks there; the
 *   admin's preview does);
 * - BitChord's FAR_LINES: every line past the four either side of the current one stays at the farthest fade;
 * - FTN+'s sizes (set on the page by --lyric-size), the current line a third of the way down like BitChord's
 *   full-screen player, no side padding so the lines line up with the rest of the page.
 */
const SHEET =
  ".lyrics-footer { visibility: hidden !important; pointer-events: none !important; }" +
  ".lyrics-header { display: none !important; }" +
  ".lyrics-line:not(.active):not(.pre-active):not(.lyrics-activest):not(.post-active-line):not(.next-active-line)" +
  ":not(.prev-2):not(.prev-3):not(.next-2):not(.next-3):not(.lyrics-gap) { opacity: 0.46; }" +
  ".lyrics-container { --lyplus-font-size-base: var(--lyric-size, 30px); --am-lyrics-line-height: 1.25;" +
  " --am-lyrics-line-spacing: calc(var(--lyric-size, 30px) * 0.7); --lyrics-scroll-padding-top: 30%;" +
  " --am-lyrics-inline-padding: 0px; padding-top: 0; }";

const NO_CLICK = ".lyrics-line { cursor: default !important; pointer-events: none; }";

/** FTN+ cream (--text in plus.css): the sung words, as the approved mockups show the current line. */
const HIGHLIGHT = "#fff8e6";

let fontReady: Promise<void> | null = null;
/** am-lyrics measures its lines for the scroll and the wipe, so it's only built once the face is in (BitChord's
 *  loadLyricFont); a slow network gives up after 1.5 s. */
function loadFont(family: string): Promise<void> {
  fontReady ??= Promise.race([
    Promise.all([document.fonts.load(`700 30px ${family}`), document.fonts.load(`400 30px ${family}`)]),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ])
    .catch(() => undefined)
    .then(() => undefined);
  return fontReady;
}

/** Where the song is, in seconds, and whether it's moving (BitChord's getPlayhead()); null when unknown. */
export type Playhead = { sec: number; paused: boolean } | null;

/**
 * The lyrics of one song, moving every frame. [playhead] is read each frame. As BitChord's LyricsView follows a
 * loop mix: each reading is stamped with when it was taken, and a jump back or far forward (a loop's wrap, a seek
 * in a replay) is told to the clock as a jump, not steered out. Not moving, the clock holds on the reading
 * (BitChord's hold on pause); unknown, the lyrics stay where they are. The offset (positive = the lyrics later) is
 * BitChord's: the reading minus the offset, and a change of offset is a jump too.
 */
export function LyricsView({ ttml, offsetMs, playhead, onLine }: { ttml: string; offsetMs: number; playhead: () => Playhead; onLine?: (sec: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const element = useRef<AmLyricsElement | null>(null);
  const [mod, setMod] = useState<LyricsModule | null>(null);
  const [shown, setShown] = useState(false);
  const read = useRef(playhead);
  read.current = playhead;
  const offset = useRef(offsetMs);
  offset.current = offsetMs;
  const lineClick = useRef(onLine);
  lineClick.current = onLine;
  const clickable = !!onLine;

  // Created by hand, with its TTML set before it's attached (BitChord: through React the properties arrive a
  // beat late, and am-lyrics would start a lookup of its own).
  useEffect(() => {
    let alive = true;
    const target = host.current;
    if (!target) return;
    const family = getComputedStyle(target).fontFamily;
    let el: AmLyricsElement | null = null;
    void Promise.all([loadLyricsModule(), loadFont(family)])
      .then(([m]) => {
        if (!alive) return;
        el = document.createElement("am-lyrics") as AmLyricsElement;
        el.ttml = ttml;
        el.interpolate = true;
        el.autoScroll = true;
        el.noAutoAlternates = true;
        el.highlightColor = HIGHLIGHT;
        el.fontFamily = family;
        el.style.setProperty("--am-lyrics-highlight-color", HIGHLIGHT);
        // BitChord's line-click: the song to that line, moved by the offset (PlayerLyrics.kt adjustedLyricsSeekTarget)
        el.addEventListener("line-click", (event) => {
          const ms = (event as CustomEvent<{ timestamp: number }>).detail?.timestamp;
          if (typeof ms === "number") lineClick.current?.(Math.max(0, ms + offset.current) / 1000);
        });
        target.appendChild(el as HTMLElement);
        element.current = el;
        setMod(m);
        void Promise.resolve(el.updateComplete).then(() => {
          const root = el?.shadowRoot;
          if (root) {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(clickable ? SHEET : SHEET + NO_CLICK);
            root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
          }
          // one frame for the first placement, then fade in (no scroll from the top)
          requestAnimationFrame(() => alive && setShown(true));
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
      el?.remove();
      element.current = null;
    };
    // Mounted once per song (keyed by the page); new TTML is handed over below.
  }, []);

  useEffect(() => {
    if (element.current && element.current.ttml !== ttml) element.current.ttml = ttml;
  }, [ttml, mod]);

  // BitChord's per-frame loop. No React state per frame: the time is written straight onto the element.
  useEffect(() => {
    const el = element.current;
    if (!el || !mod) return;
    const first = read.current();
    const clock = new mod.LyricClock(Math.max(0, (first?.sec ?? 0) * 1000 - offset.current));
    let jumps = 0;
    let last = first?.sec ?? 0;
    let held = false;
    let frame = 0;
    const tick = () => {
      const now = performance.now();
      const p = read.current();
      const off = offset.current;
      if (!p || p.paused) {
        // not moving (a Studio host's pause, a paused replay): settle on the reading outright, or, with none,
        // where the lyrics are
        const ms = p ? Math.max(0, Math.trunc(p.sec * 1000) - off) : clock.displayedMs;
        if (!held || ms !== clock.displayedMs) clock.hold(ms, now);
        if (p) last = p.sec;
        el.currentTime = ms;
        held = true;
        frame = requestAnimationFrame(tick);
        return;
      }
      if (held) {
        clock.restart();
        held = false;
      }
      const sec = p.sec;
      if (sec < last - 0.15 || sec > last + 1) jumps++;
      last = sec;
      // PlayerLyrics.kt adjustedLyricsPosition, and the offset in the discontinuity (LyricPlayhead.discontinuity)
      el.currentTime = clock.frame(now, Math.max(0, Math.trunc(sec * 1000) - off), now, jumps * 100_000 + off);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mod]);

  return <div className={`lyrics${shown ? " in" : ""}`} ref={host} aria-label="Lyrics" />;
}
