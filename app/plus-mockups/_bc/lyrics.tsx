'use client';
/*
 * The lyrics view from BitChord's LyricsPanel.tsx (GPL-3.0, acf219a7): the
 * same am-lyrics web component (MPL-2.0), the same adopted stylesheet and the
 * same full-screen sizes. The mockup feeds it placeholder TTML and a clock that
 * starts at the song's position; the real one follows the radio's timeline.
 */
import { useEffect, useRef, useState } from 'react';
import { lyrics } from './data';

type AmLyricsElement = HTMLElement & {
  currentTime: number;
  ttml?: string;
  interpolate: boolean;
  autoScroll: boolean;
  highlightColor: string;
  fontFamily?: string;
  updateComplete?: Promise<unknown>;
};

// ---- Verbatim from BitChord ------------------------------------------------
const HIDE_FOOTER = '.lyrics-footer { visibility: hidden !important; pointer-events: none !important; }';
const LYRIC_FONT = "'BitChord SF Pro Display', 'DM Sans', system-ui, sans-serif";
const FAR_LINES =
  '.lyrics-line:not(.active):not(.pre-active):not(.lyrics-activest):not(.post-active-line):not(.next-active-line)' +
  ':not(.prev-2):not(.prev-3):not(.next-2):not(.next-3):not(.lyrics-gap) { opacity: 0.46; }';
const FULL_SIZE =
  ':host([data-full]) .lyrics-container { --lyplus-font-size-base: var(--bitchord-lyric-size, 34px);' +
  ' --am-lyrics-line-height: 1.2; --am-lyrics-line-spacing: calc(var(--bitchord-lyric-size, 34px) * 0.7);' +
  ' --lyrics-scroll-padding-top: 30%; --am-lyrics-inline-padding: 0px; }';
const panel = 'group/panel relative isolate flex min-h-0 flex-1 flex-col overflow-hidden';
const fullSizes =
  '[--bitchord-lyric-size:26px] min-[980px]:[--bitchord-lyric-size:30px] min-[1320px]:[--bitchord-lyric-size:36px] min-[1680px]:[--bitchord-lyric-size:42px]';
// -----------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Word-synced TTML for the placeholder lyrics: each line's words share its time evenly. */
function buildTtml(): string {
  const lines = lyrics
    .map(([text, begin, end]) => {
      const words = text.split(' ');
      const step = (end - begin) / words.length;
      const spans = words
        .map((w, i) => `<span begin="${(begin + i * step).toFixed(3)}" end="${(begin + (i + 1) * step).toFixed(3)}">${esc(w)}${i < words.length - 1 ? ' ' : ''}</span>`)
        .join('');
      return `<p begin="${begin.toFixed(3)}" end="${end.toFixed(3)}">${spans}</p>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyrics" itunes:timing="Word"><body><div>${lines}</div></body></tt>`;
}

export function Lyrics({ full, startSec }: { full: boolean; startSec: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let el: AmLyricsElement | null = null;
    let frame = 0;
    let cancelled = false;
    void import('@uimaxbai/am-lyrics/am-lyrics.js').then(() => {
      if (cancelled) return;
      el = document.createElement('am-lyrics') as AmLyricsElement;
      el.ttml = buildTtml();
      el.interpolate = true;
      el.autoScroll = true;
      el.highlightColor = '#ffffff';
      el.fontFamily = LYRIC_FONT;
      el.className = 'block min-h-0 flex-1 overflow-hidden [--am-lyrics-highlight-color:#fff]';
      el.toggleAttribute('data-full', full);
      host.current?.appendChild(el as Node);
      const node = el;
      void Promise.resolve(el.updateComplete).then(() => {
        const root = node.shadowRoot;
        if (!root) return;
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(HIDE_FOOTER + FAR_LINES + FULL_SIZE);
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
        setReady(true);
      });
      // The radio's clock: the song's position now, then real time.
      const t0 = performance.now();
      const tick = () => {
        node.currentTime = startSec * 1000 + (performance.now() - t0);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      el?.remove();
    };
  }, [full, startSec]);

  return (
    <div className={full ? `${panel} ${fullSizes}` : panel} data-ready={ready || undefined}>
      <div
        ref={host}
        className={
          full ? 'flex min-h-0 flex-1 [mask-image:linear-gradient(180deg,transparent,#000_80px,#000_50%,transparent)]' : 'flex min-h-0 flex-1'
        }
      />
    </div>
  );
}
