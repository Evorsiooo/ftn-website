'use client';
/*
 * The pages that stand outside the app frame: the video player (BitChord's
 * full-screen player in its "theater" mode, the way it plays a music video)
 * and the caller's waiting room (the full-screen player's mesh and artwork,
 * with the waiting room's own card in settingsUi rows).
 */
import { ChevronDown, Mic, PhoneOff, RotateCcw, RotateCw, Subtitles, X, Maximize } from 'lucide-react';
import { useEffect, useState } from 'react';
import { art, nowPlaying, show, videos, wide } from './data';
import { BackwardIcon, ForwardIcon, PauseIcon, UpNextIcon } from './icons';
import { MeshBackdrop } from './mesh';
import { fadeForVolume, VolumeControl } from './shell';
import { settingsUi } from './styles';
import { Artwork, detailButton, LiveBadge } from './ui';

const chromeButton =
  'grid size-8 place-items-center rounded-full text-secondary transition-[background-color,color] duration-100 ease-in hover:bg-quinary hover:text-primary';
const chrome = `absolute z-1 ${chromeButton}`;
const transportButton =
  'grid place-items-center rounded-full transition-[background-color,scale] duration-100 ease-in enabled:hover:bg-quinary enabled:active:scale-90 disabled:opacity-40';
const toggle = `${transportButton} size-9 text-tertiary hover:text-primary`;
const skip = `${transportButton} size-12 text-primary`;

// ---- Video player ------------------------------------------------------------------

export function VideoPlayer() {
  const video = videos[1]!;
  const [volumeOpen, setVolumeOpen] = useState(false);
  const progress = 0.37;
  return (
    <div className="fixed inset-0 isolate overflow-hidden text-primary" data-full-screen role="dialog" aria-label={video.title}>
      {/* The video (a still in the mockup), contained in the window as BitChord's theater. */}
      <div className="absolute inset-0 bg-black">
        { }
        <img src={wide('cycling')} alt="" className="size-full object-contain" />
      </div>

      <a href="/plus-mockups/home" className={`${chrome} top-4 left-5`} aria-label="Close">
        <X size={20} />
      </a>
      {/* VideoQuality: the label morphs as BitChord's does. */}
      <button className="absolute top-[18px] right-15 z-1 inline-flex h-7 items-center gap-1 rounded-pill bg-quinary px-2.5 type-callout-emphasized text-secondary hover:text-primary">
        1080p <ChevronDown size={13} />
      </button>
      <button className={`${chrome} top-4 right-5`} aria-label="Enter full screen">
        <Maximize size={18} />
      </button>

      <div className="absolute inset-x-0 bottom-0 flex justify-center bg-[linear-gradient(to_top,rgb(0_0_0/0.72),rgb(0_0_0/0.35)_55%,transparent)] px-6 pt-32 pb-16">
        <section className="flex w-[min(720px,100%)] min-w-0 flex-col" aria-label="Player">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="min-w-0 max-w-full self-start truncate type-[600_17px/22px]">{video.title}</span>
              <span className="truncate type-title-3 text-secondary">FTN Sports — Harrison Grand Prix</span>
            </div>
          </div>
          {/* BitChord's Scrubber: video on demand keeps seeking. */}
          <div className="group/scrub mt-3.5">
            <div className="group/hit flex h-4 cursor-pointer touch-none items-center">
              <div className="relative h-1 flex-1 overflow-hidden rounded-[999px] bg-quaternary transition-[height] duration-120 ease-in group-hover/hit:h-2">
                <div className="relative size-full origin-left scale-x-(--progress) bg-secondary group-hover/hit:bg-primary" style={{ '--progress': progress } as React.CSSProperties} />
              </div>
            </div>
            <div className="relative mt-0.5 flex justify-between type-[500_11px/14px] tabular-nums text-tertiary">
              <span>4:28</span>
              <span>-7:36</span>
            </div>
          </div>
          <div className="mx-auto mt-[clamp(8px,1.6vh,16px)] flex h-13 w-[min(100%,315px)] items-center justify-between">
            <button className={toggle} aria-label="Back 10 seconds">
              <RotateCcw size={22} strokeWidth={2} />
            </button>
            <button className={skip} aria-label="Previous video">
              <BackwardIcon size={40} />
            </button>
            <button className={`${transportButton} size-14 text-primary`} aria-label="Pause">
              <PauseIcon size={48} />
            </button>
            <button className={skip} aria-label="Next video">
              <ForwardIcon size={40} />
            </button>
            <button className={toggle} aria-label="Forward 10 seconds">
              <RotateCw size={22} strokeWidth={2} />
            </button>
          </div>
        </section>
      </div>

      <button className={`${chrome} bottom-5 left-5`} aria-label="Subtitles">
        <Subtitles size={18} />
      </button>
      <div
        className="group/actions absolute right-5 bottom-5 z-1 flex items-center [--volume-gap:36px]"
        data-volume-open={volumeOpen || undefined}
        onPointerLeave={() => setVolumeOpen(false)}
      >
        <button className={`${chromeButton} ${fadeForVolume}`} aria-label="Up Next">
          <UpNextIcon size={18} />
        </button>
        <VolumeControl open={volumeOpen} onOpen={() => setVolumeOpen(true)} className={chromeButton} iconSize={18} />
      </div>
    </div>
  );
}

// ---- Caller waiting room ---------------------------------------------------------------

/** A mic check: seven bars that follow the input level (animated here). */
export function LevelMeter({ bars = 7, live = true, className = '' }: { bars?: number; live?: boolean; className?: string }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setT((n) => n + 1), 140);
    return () => clearInterval(id);
  }, [live]);
  const level = live ? 0.35 + 0.35 * Math.abs(Math.sin(t * 0.9)) + 0.2 * Math.abs(Math.sin(t * 2.3)) : 0;
  return (
    <span className={`inline-flex h-4 items-end gap-[3px] ${className}`} aria-label="Microphone level">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-[1.5px] transition-[height,background-color] duration-150 ${(i + 1) / bars <= level ? 'bg-green' : 'bg-quaternary'}`}
          style={{ height: `${30 + (70 * (i + 1)) / bars}%` }}
        />
      ))}
    </span>
  );
}

export function WaitingRoom() {
  return (
    <div className="fixed inset-0 isolate overflow-y-auto text-primary" data-full-screen>
      <div className="fixed inset-0 -z-1">
        <MeshBackdrop artworkUrl={show.art} playing />
      </div>
      <a href="/plus-mockups/radio" className={`${chrome} top-4 left-5`} aria-label="Leave">
        <X size={20} />
      </a>

      <div className="mx-auto flex min-h-full w-[min(100%,440px)] flex-col items-center px-6 pt-12 pb-28 text-center">
        <div className="relative w-[clamp(120px,18vh,200px)] rounded-[10px]">
          { }
          <img className="absolute inset-0 -z-1 size-full translate-y-2 scale-96 rounded-[10px] object-cover opacity-40 blur-[20px] saturate-200" src={show.art} alt="" />
          <Artwork src={show.art} radius="10px" />
        </div>
        <p className="mt-5 type-subhead-emphasized uppercase text-secondary">FTN Radio · {show.title}</p>
        <h1 className="mt-1 type-title-1-emphasized">You’re in the waiting room</h1>
        <p className="mt-2 type-title-3 text-secondary">
          You’re <span className="text-primary">3rd in line</span>. {show.host} will bring you on air. Keep this tab open.
        </p>
        <a href="/plus-mockups/radio" className={`${detailButton.pill} mt-5 !bg-quaternary !text-primary`}>
          <PhoneOff size={17} />
          <span>Leave the Line</span>
        </a>

        <div className="mt-7 w-full text-start">
          <h2 className={settingsUi.sectionHeader}>Before you go on air</h2>
          <div className={settingsUi.group}>
            <label className={settingsUi.controlRow}>
              <span className="flex items-center gap-2.5">
                <Mic size={16} className="text-secondary" /> Microphone
              </span>
              <span className={settingsUi.value}>
                Headset (USB) <ChevronDown size={14} />
              </span>
            </label>
            <div className={settingsUi.row}>
              <span className={settingsUi.rowText}>
                <span>Mic check</span>
                <span className={settingsUi.rowDetail}>Say something: the bars should move.</span>
              </span>
              <LevelMeter />
            </div>
            <label className={settingsUi.controlRow}>
              <span className={settingsUi.rowText}>
                <span>Your name on air</span>
                <span className={settingsUi.rowDetail}>From your Roblox account</span>
              </span>
              <span className={settingsUi.value}>Theo · @clarkcitycat</span>
            </label>
            <label className={settingsUi.controlRow}>
              <span>Topic</span>
              <input className={`${settingsUi.input} w-[180px] max-sm:w-[150px]`} defaultValue="Shout-out for a friend" />
            </label>
          </div>
          <p className={settingsUi.footer}>Music keeps playing while you wait. When you’re on air, the music goes quiet under your voice.</p>
        </div>
      </div>

      {/* What the caller hears meanwhile: the radio's LCD on the glass pill. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-1 flex justify-center px-4">
        <div className="glass-pill pointer-events-auto relative flex h-(--player-pill-height) w-[min(420px,100%)] items-center gap-3 rounded-pill pr-5 pl-3">
          <span className="w-[34px] flex-none">
            <Artwork src={nowPlaying.art} radius="6px" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col text-start">
            <span className="truncate type-body-emphasized">{nowPlaying.title}</span>
            <span className="truncate type-callout-medium text-secondary">{nowPlaying.artist}</span>
          </span>
          <LiveBadge />
        </div>
      </div>
    </div>
  );
}

export { art };
