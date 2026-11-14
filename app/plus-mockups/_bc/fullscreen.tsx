'use client';
/*
 * BitChord's full-screen player (web/app/src/shell/FullScreenPlayer.tsx,
 * GPL-3.0, acf219a7) for the radio: the moving mesh of the artwork's colours,
 * the artwork with its glow, the names, the lyrics column (or Coming Up) and
 * the corner chrome, with BitChord's own classes. The scrubber becomes a
 * read-out and the five-button transport becomes Listen / Stop, with the
 * show underneath.
 */
import { Maximize, MoreHorizontal, ThumbsUp, X } from 'lucide-react';
import { useState } from 'react';
import { fmt, nowPlaying, show } from './data';
import { LyricsActiveIcon, LyricsIcon, UpNextIcon } from './icons';
import { Lyrics } from './lyrics';
import { MeshBackdrop } from './mesh';
import { ComingUp, fadeForVolume, ListenButton, useUi, VolumeControl } from './shell';

const chromeButton =
  'grid size-8 place-items-center rounded-full text-secondary transition-[background-color,color] duration-100 ease-in hover:bg-quinary hover:text-primary';
const chrome = `absolute z-1 ${chromeButton}`;
const transportButton =
  'grid place-items-center rounded-full transition-[background-color,scale] duration-100 ease-in enabled:hover:bg-quinary enabled:active:scale-90 disabled:opacity-40';
const roundAction = 'grid size-8 flex-none place-items-center rounded-full bg-quinary text-primary hover:bg-quaternary';

/** BitChord's Scrubber, read-only: the song's place in the station's timeline. */
function TimelineReadout() {
  const progress = nowPlaying.elapsedSec / nowPlaying.durationSec;
  return (
    <div className="mt-3.5">
      <div className="flex h-4 items-center">
        <div className="relative h-1 flex-1 overflow-hidden rounded-[999px] bg-quaternary" aria-hidden="true">
          <div className="relative size-full origin-left scale-x-(--progress) bg-secondary" style={{ '--progress': progress } as React.CSSProperties} />
        </div>
      </div>
      <div className="relative mt-0.5 flex justify-between type-[500_11px/14px] tabular-nums text-tertiary">
        <span>{fmt(nowPlaying.elapsedSec)}</span>
        <span className="pointer-events-none absolute inset-x-0 text-center text-secondary">LIVE</span>
        <span>-{fmt(nowPlaying.durationSec - nowPlaying.elapsedSec)}</span>
      </div>
    </div>
  );
}

/** Where BitChord's transport sits: Listen / Stop, then the show on air. */
function RadioTransport() {
  return (
    <div className="mx-auto mt-[clamp(8px,1.6vh,16px)] flex w-[min(100%,315px)] flex-col items-center gap-[clamp(10px,1.8vh,18px)]">
      <ListenButton size={48} className={`${transportButton} size-14 text-primary`} />
      <div className="flex max-w-full items-center gap-2.5 rounded-pill bg-quinary py-1 pr-3.5 pl-1">
        { }
        <img src={show.art} alt="" className="size-7 rounded-full object-cover" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate type-callout-emphasized">{show.title}</span>
          <span className="truncate type-[500_11px/14px] text-secondary">
            {show.kind} · until {show.until} · {show.listeners} listening
          </span>
        </span>
      </div>
    </div>
  );
}

export function RadioFullScreen() {
  const { setFullScreen, fullScreenPanel, listening } = useUi();
  const [panel, setPanel] = useState<'lyrics' | 'queue' | null>(fullScreenPanel);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [voted, setVoted] = useState(false);
  const showLyrics = panel === 'lyrics';
  const showQueue = panel === 'queue';
  const column = showLyrics || showQueue;
  const togglePanel = (p: 'lyrics' | 'queue') => setPanel((on) => (on === p ? null : p));
  const artworkLayer = 'absolute inset-0 size-full rounded-[inherit] object-cover transition-opacity duration-300 ease-in';

  return (
    <div
      className="fixed inset-0 z-[calc(var(--z-contextual-menus)-2)] isolate animate-enter overflow-hidden text-primary [--art:min(32vw,calc(100dvh-330px),720px)] motion-reduce:[animation-name:fade-in] max-md:[--art:min(84vw,calc(100dvh-330px),420px)]"
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
      data-full-screen
      data-paused={!listening || undefined}
    >
      <MeshBackdrop artworkUrl={nowPlaying.art} playing={listening} />

      <button className={`${chrome} top-4 left-5`} aria-label="Close" onClick={() => setFullScreen(false)}>
        <X size={20} />
      </button>
      <button className={`${chrome} top-4 right-5`} aria-label="Enter full screen">
        <Maximize size={18} />
      </button>

      <div
        className={`grid h-full items-center justify-center gap-x-[clamp(48px,7vw,144px)] px-[clamp(24px,9vw,144px)] py-16 max-md:px-6 max-md:pb-18 ${
          column
            ? 'grid-cols-[var(--art)_minmax(0,38vw)] max-md:grid-cols-[minmax(0,1fr)] max-md:grid-rows-[minmax(0,1fr)_auto] max-md:items-stretch max-md:gap-y-4'
            : 'grid-cols-[var(--art)]'
        }`}
        data-lyrics={column || undefined}
      >
        <section className={`flex w-(--art) min-w-0 flex-col${column ? ' max-md:order-2 max-md:w-full' : ''}`} aria-label="Player">
          <div
            className={`relative aspect-square w-(--art) rounded-[10px] transition-[scale] duration-450 ease-[cubic-bezier(0.34,1.3,0.64,1)] motion-reduce:transition-none${
              listening ? '' : ' scale-92'
            }${column ? ' max-md:hidden' : ''}`}
          >
            { }
            <img className={`${artworkLayer} -z-1 translate-y-2 scale-96 opacity-40 blur-[20px] saturate-200`} src={nowPlaying.art} alt="" />
            { }
            <img className={`${artworkLayer} bg-[#ffffff12] opacity-100 shadow-[0_4px_10px_#0000001a]`} src={nowPlaying.art} alt="" />
          </div>

          <div className={`mt-[clamp(20px,3.2vh,32px)] flex items-center gap-3${column ? ' max-md:mt-0' : ''}`}>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-w-0 items-center">
                <span className="min-w-0 max-w-full self-start truncate type-[600_17px/22px]">{nowPlaying.title}</span>
              </div>
              <span className="truncate type-title-3 text-secondary">
                {nowPlaying.artist} — {show.title}
              </span>
            </div>
            <button className={`${roundAction} aria-pressed:text-key`} aria-label="Vote for this song" aria-pressed={voted} onClick={() => setVoted(!voted)}>
              <ThumbsUp size={16} strokeWidth={2} fill={voted ? 'currentColor' : 'none'} />
            </button>
            <button className={roundAction} aria-label="More">
              <MoreHorizontal size={18} />
            </button>
          </div>

          <TimelineReadout />
          <RadioTransport />
        </section>

        {showLyrics && (
          <section className="flex min-h-0 animate-fade-in self-stretch" aria-label="Lyrics">
            <Lyrics full startSec={nowPlaying.elapsedSec} />
          </section>
        )}
        {showQueue && (
          <section className="flex min-h-0 animate-fade-in flex-col self-stretch [mask-image:linear-gradient(180deg,#000_calc(100%-80px),transparent)]" aria-label="Coming Up">
            <ComingUp />
          </section>
        )}
      </div>

      <button className={`${chrome} bottom-5 left-5 aria-pressed:text-primary`} aria-label="Lyrics" aria-pressed={showLyrics} onClick={() => togglePanel('lyrics')}>
        {showLyrics ? <LyricsActiveIcon size={18} /> : <LyricsIcon size={18} />}
      </button>
      <div
        className="group/actions absolute right-5 bottom-5 z-1 flex items-center [--volume-gap:36px]"
        data-volume-open={volumeOpen || undefined}
        onPointerLeave={() => setVolumeOpen(false)}
      >
        <button className={`${chromeButton} ${fadeForVolume} aria-pressed:text-primary`} aria-label="Coming Up" aria-pressed={showQueue} onClick={() => togglePanel('queue')}>
          <UpNextIcon size={18} />
        </button>
        <VolumeControl open={volumeOpen} onOpen={() => setVolumeOpen(true)} className={chromeButton} iconSize={18} />
      </div>
    </div>
  );
}
