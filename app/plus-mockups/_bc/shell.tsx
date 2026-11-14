'use client';
/*
 * BitChord's app frame for FTN+ (web/app/src/shell, GPL-3.0, acf219a7):
 * AppShell, Sidebar, MobileTopBar, PlayerBar (the glass pill), Lcd,
 * VolumeControl, SidePanel and UpNext. Class strings are BitChord's own.
 *
 * What changes for the radio (Adrien: it must look like a radio, with no
 * skip, pause or seek):
 *  - The pill's shuffle / previous / play / next / repeat cluster becomes one
 *    Listen / Stop button and a LIVE badge. Stop leaves the stream; pressing
 *    Listen again joins wherever the station is now (no pause, no rewind).
 *  - The LCD's progress line stays, but it is a read-out: no hover times, no
 *    scrubbing.
 *  - Up Next becomes "Coming Up": the station's own order, with start times,
 *    and no remove, reorder or Play Next.
 *  - The star becomes a thumbs-up, the existing anonymous song vote.
 *  - Phones get the docked mini player from apple-music-dom.md §11 (BitChord
 *    hides its pill below 484px and has no mini player).
 */
import { Bookmark, CalendarDays, Menu as MenuIcon, Mic, Radio, ThumbsUp, Trophy, Users } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { comingUp, fmt, me, nowPlaying, recentlyPlayed, show } from './data';
import {
  HomeIcon,
  LyricsActiveIcon,
  LyricsIcon,
  MusicVideosIcon,
  PlayIcon,
  RecentlyAddedIcon,
  SearchIcon,
  StopIcon,
  UpNextIcon,
  VolumeIcon,
  type NavIconProps,
} from './icons';
import { Lyrics } from './lyrics';
import { Artwork, LiveBadge } from './ui';
import { RadioFullScreen } from './fullscreen';

// ---- UI state (state/ui.ts, as a context) -----------------------------------

type Panel = 'lyrics' | 'up-next' | null;
interface Ui {
  sidePanel: Panel;
  toggleSidePanel: (p: Exclude<Panel, null>) => void;
  fullScreen: boolean;
  setFullScreen: (on: boolean) => void;
  fullScreenPanel: 'lyrics' | 'queue' | null;
  drawerOpen: boolean;
  setDrawerOpen: (on: boolean) => void;
  listening: boolean;
  setListening: (on: boolean) => void;
}
const UiContext = createContext<Ui | null>(null);
export const useUi = () => useContext(UiContext)!;

// ---- Sidebar (shell/Sidebar.tsx) ---------------------------------------------

interface NavItem {
  key: string;
  label: string;
  Icon: (props: NavIconProps) => ReactNode;
}

/** A lucide glyph at 17px inside the 24px icon box, as BitChord's playlist rows. */
const lucide = (Glyph: typeof Radio) =>
  function LucideNav({ className }: NavIconProps) {
    return (
      <span className={className}>
        <Glyph size={17} strokeWidth={1.8} />
      </span>
    );
  };

const PRIMARY: NavItem[] = [
  { key: 'search', label: 'Search', Icon: SearchIcon },
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'radio', label: 'Radio', Icon: lucide(Radio) },
  { key: 'library', label: 'Library', Icon: MusicVideosIcon },
  { key: 'sports', label: 'Sports', Icon: lucide(Trophy) },
  { key: 'schedule', label: 'Schedule', Icon: lucide(CalendarDays) },
];
const YOURS: NavItem[] = [
  { key: 'saved', label: 'Saved', Icon: lucide(Bookmark) },
  { key: 'continue', label: 'Continue Watching', Icon: RecentlyAddedIcon },
];
const BROADCAST: NavItem[] = [
  { key: 'studio', label: 'Studio', Icon: lucide(Mic) },
  { key: 'waiting-room', label: 'Caller Waiting Room', Icon: lucide(Users) },
];

const item =
  'group flex h-9 items-center gap-2 mb-0.5 p-1 rounded-nav type-body-reduced text-primary hover:bg-quinary aria-[current=page]:bg-nav-selected';
const icon = 'inline-grid size-6 flex-none place-items-center text-primary group-aria-[current=page]:text-key';
const navLabel = 'min-w-0 truncate';
const sectionHeader = 'mt-4 px-2 py-1 type-callout-emphasized text-secondary';
const list = 'flex flex-col';

const HREF: Record<string, string> = {
  home: '/plus-mockups/home',
  radio: '/plus-mockups/radio',
  library: '/plus-mockups/library',
  sports: '/plus-mockups/sports',
  schedule: '/plus-mockups/schedule',
  studio: '/plus-mockups/studio',
  'waiting-room': '/plus-mockups/waiting-room',
};

function NavList({ items, active }: { items: NavItem[]; active: string }) {
  return (
    <ul className={list}>
      {items.map(({ key, label, Icon }) => (
        <li key={key}>
          <a href={HREF[key] ?? '#'} className={item} aria-current={key === active ? 'page' : undefined}>
            <Icon size={24} className={icon} />
            <span className={navLabel}>{label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The FTN+ wordmark, white on dark and dark on light, where BitChord has its mark and name. */
function Wordmark({ height = 24 }: { height?: number }) {
  return (
    <>
      { }
      <img src="/logos/ftnplus_textwhite_transparent.png" alt="FTN+" style={{ height }} className="w-auto [@media(prefers-color-scheme:light)]:hidden" />
      { }
      <img src="/logos/ftnplus_text_transparent.png" alt="FTN+" style={{ height }} className="hidden w-auto [@media(prefers-color-scheme:light)]:block" />
    </>
  );
}

export function Sidebar({ active }: { active: string }) {
  const { drawerOpen, setDrawerOpen } = useUi();
  return (
    <>
      <nav
        className="absolute inset-y-0 left-0 z-(--z-web-chrome) flex w-(--web-navigation-width) flex-col glass-material max-sm:w-[min(300px,82vw)] max-sm:-translate-x-full max-sm:shadow-glass max-sm:transition-transform max-sm:duration-(--duration-panel) max-sm:ease-panel max-sm:data-[open=true]:translate-none"
        data-open={drawerOpen}
        aria-label="Main"
      >
        <div className="mt-2 ml-2 flex h-18 items-center px-5">
          <a href="/plus-mockups/home" className="inline-flex items-center gap-2 rounded-[6px]" aria-label="FTN+, Home">
            <Wordmark />
          </a>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-3 pl-5 [scrollbar-width:none]">
          <NavList items={PRIMARY} active={active} />
          <h2 className={sectionHeader}>Your Library</h2>
          <NavList items={YOURS} active={active} />
          <h2 className={sectionHeader}>Broadcast</h2>
          <NavList items={BROADCAST} active={active} />
        </div>
        <div className="flex flex-col gap-2 pt-3 pr-3 pb-5 pl-5">
          {/* AccountButton, signed in: 24px avatar and the Roblox name. */}
          <button className="flex w-full min-w-0 items-center gap-2 rounded-nav px-1 py-1.5 text-start type-body-reduced text-primary hover:bg-quinary">
            <span className="w-6 flex-none">
              <Artwork src={me.art} radius="50%" />
            </span>
            <span className="min-w-0 flex-1 truncate">{me.name}</span>
          </button>
          <div className="flex items-center justify-between">
            <a className="inline-flex items-center gap-1 ps-1 type-callout text-primary hover:underline" href="https://ftn.euno.cc/">
              <span>FTN News</span>
            </a>
          </div>
        </div>
      </nav>
      {drawerOpen && <div className="absolute inset-0 z-[calc(var(--z-web-chrome)-1)] hidden bg-scrim max-sm:block" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
    </>
  );
}

// ---- MobileTopBar (shell/MobileTopBar.tsx) -----------------------------------

export function MobileTopBar() {
  const { setDrawerOpen } = useUi();
  return (
    <header className="hidden max-sm:absolute max-sm:inset-x-0 max-sm:top-0 max-sm:z-[calc(var(--z-web-chrome)-2)] max-sm:grid max-sm:h-(--mobile-top-bar-height) max-sm:grid-cols-[44px_1fr_44px] max-sm:items-center max-sm:px-3.5 max-sm:glass-material">
      <button className="grid size-11 place-items-center rounded-full" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
        <MenuIcon size={22} strokeWidth={2} />
      </button>
      <a href="/plus-mockups/home" className="inline-flex items-center gap-1.5 justify-self-center" aria-label="FTN+, Home">
        <Wordmark height={20} />
      </a>
      <span className="grid w-11 place-items-center">
        <span className="w-7">
          <Artwork src={me.art} radius="50%" />
        </span>
      </span>
    </header>
  );
}

// ---- VolumeControl (shell/VolumeControl.tsx) ---------------------------------

const slider = [
  'absolute top-1/2 right-[var(--volume-gap,33px)] mx-0 mb-0 -mt-2 block h-4 w-24 cursor-pointer appearance-none bg-transparent',
  'pointer-events-none translate-x-2 opacity-0 transition-[opacity,translate]',
  'data-open:pointer-events-auto data-open:translate-none data-open:opacity-100',
  '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-[2px] [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--systemPrimary)_var(--fill),var(--systemQuaternary)_var(--fill))]',
  '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-[2px] [&::-moz-range-track]:bg-[linear-gradient(to_right,var(--systemPrimary)_var(--fill),var(--systemQuaternary)_var(--fill))]',
  '[&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_2px_#0006]',
  '[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_0_2px_#0006]',
].join(' ');

export const fadeForVolume =
  'transition-opacity group-data-volume-open/actions:pointer-events-none group-data-volume-open/actions:opacity-0';

export function VolumeControl({ open, onOpen, className, iconSize = 20 }: { open: boolean; onOpen: () => void; className: string; iconSize?: number }) {
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const level = muted ? 0 : volume;
  return (
    <span>
      <input
        className={slider}
        data-open={open || undefined}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={level}
        aria-label="Volume"
        tabIndex={open ? 0 : -1}
        style={{ '--fill': `${level * 100}%` } as React.CSSProperties}
        onChange={(e) => {
          setMuted(false);
          setVolume(Number(e.currentTarget.value));
        }}
      />
      <button className={className} aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} onClick={() => setMuted(!muted)} onPointerEnter={onOpen} onFocus={onOpen}>
        <VolumeIcon level={level} size={iconSize} />
      </button>
    </span>
  );
}

// ---- The radio pill (shell/PlayerBar.tsx) ------------------------------------

const control = 'grid place-items-center rounded-[6px] disabled:opacity-40';
const transport = `${control} size-7 text-primary`;
const action = 'grid h-7 w-6 place-items-center rounded-[4px] text-primary aria-pressed:text-key';
const fading = `${action} ${fadeForVolume}`;

/** Listen / Stop: the radio's only transport. */
export function ListenButton({ size = 28, className = transport }: { size?: number; className?: string }) {
  const { listening, setListening } = useUi();
  return (
    <button className={className} aria-label={listening ? 'Stop' : 'Listen live'} onClick={() => setListening(!listening)}>
      {listening ? <StopIcon size={size} /> : <PlayIcon size={size} />}
    </button>
  );
}

export function RadioPill() {
  const { sidePanel, toggleSidePanel } = useUi();
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [voted, setVoted] = useState(false);
  return (
    <div
      className="pointer-events-none absolute right-0 bottom-(--player-bottom-offset) left-(--web-navigation-width) z-[calc(var(--z-web-chrome)-1)] flex justify-center px-5 transition-[padding-inline-end] duration-(--duration-panel) ease-panel data-[panel-open=true]:pe-[calc(var(--side-panel-width)+20px)] max-sm:hidden"
      data-panel-open={sidePanel !== null}
    >
      <div
        className="glass-pill group/pill pointer-events-auto relative grid h-(--player-pill-height) w-[min(668px,100%)] grid-cols-[184px_minmax(180px,427px)_minmax(57px,auto)] items-center rounded-pill px-4"
        role="region"
        aria-label="FTN Radio"
      >
        {/* Where the transport was: the station, live, and Listen / Stop. */}
        <div className="flex items-center gap-2.5 pr-2">
          <ListenButton />
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <LiveBadge />
            <span className="max-w-full truncate type-[600_11px/13px] text-secondary">FTN Radio</span>
          </div>
        </div>

        <div className="h-full min-w-0 px-4">
          <RadioLcd />
        </div>

        <div
          className="group/actions relative flex items-center justify-end gap-[9px]"
          data-volume-open={volumeOpen || undefined}
          onPointerLeave={() => setVolumeOpen(false)}
        >
          <button className={fading} aria-label="Vote for this song" aria-pressed={voted} onClick={() => setVoted(!voted)}>
            <ThumbsUp size={17} strokeWidth={1.9} fill={voted ? 'currentColor' : 'none'} />
          </button>
          <button className={fading} aria-label="Lyrics" aria-pressed={sidePanel === 'lyrics'} onClick={() => toggleSidePanel('lyrics')}>
            {sidePanel === 'lyrics' ? <LyricsActiveIcon size={18} /> : <LyricsIcon size={18} />}
          </button>
          <button className={fading} aria-label="Coming Up" aria-pressed={sidePanel === 'up-next'} onClick={() => toggleSidePanel('up-next')}>
            <UpNextIcon size={18} />
          </button>
          <VolumeControl open={volumeOpen} onOpen={() => setVolumeOpen(true)} className={action} />
        </div>
      </div>
    </div>
  );
}

// ---- Lcd (shell/Lcd.tsx) -------------------------------------------------------

const titleClass = 'min-w-0 max-w-full self-start truncate type-body-emphasized';

export function RadioLcd() {
  const { setFullScreen } = useUi();
  const progress = nowPlaying.elapsedSec / nowPlaying.durationSec;
  return (
    <div className="group/lcd relative grid h-full grid-cols-[34px_minmax(0,1fr)] items-center gap-x-2 pb-1.5">
      <button
        className="group/art relative block h-[34px] w-[34px] overflow-hidden rounded-[6px] bg-joe p-0 transition-[filter,opacity]"
        aria-label="Open full screen player"
        onClick={() => setFullScreen(true)}
      >
        { }
        <img src={nowPlaying.art} alt="" className="size-full object-cover" />
        <span className="absolute inset-0 grid place-items-center bg-[rgb(0_0_0/0.5)] text-white opacity-0 transition-opacity duration-200 group-hover/pill:opacity-100" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </span>
      </button>
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-center">
          <span className={`${titleClass} cursor-pointer hover:underline`}>{nowPlaying.title}</span>
        </div>
        <span className="truncate type-callout-medium text-secondary">
          {nowPlaying.artist} — {show.title}
        </span>
      </div>
      {/* The song's place on the station's timeline: shown, never dragged. */}
      <div className="absolute inset-x-0 bottom-0 h-3.5" aria-hidden="true">
        <div className="absolute inset-x-0 bottom-1.5 h-0.5 overflow-hidden rounded-[1px] bg-quaternary">
          <div className="relative size-full origin-left scale-x-(--progress) bg-secondary" style={{ '--progress': progress } as React.CSSProperties} />
        </div>
      </div>
    </div>
  );
}

// ---- Phone mini player (apple-music-dom.md §11) ------------------------------

export function MiniPlayer() {
  const { setFullScreen } = useUi();
  const progress = nowPlaying.elapsedSec / nowPlaying.durationSec;
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 z-[calc(var(--z-web-chrome)-1)] hidden max-sm:block">
      <div className="glass-pill pointer-events-auto relative grid h-(--mini-player-height) grid-cols-[minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-[14px] pr-1.5 pl-2">
        <button className="grid min-w-0 grid-cols-[38px_minmax(0,1fr)] items-center gap-x-2.5 text-start" onClick={() => setFullScreen(true)} aria-label="Open full screen player">
          <span className="w-[38px]">
            <Artwork src={nowPlaying.art} radius="6px" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate type-body-emphasized">{nowPlaying.title}</span>
            <span className="flex min-w-0 items-center gap-1.5 type-callout-medium text-secondary">
              <span className="font-semibold text-key">LIVE</span>
              <span className="truncate">{nowPlaying.artist}</span>
            </span>
          </span>
        </button>
        <ListenButton size={30} className="grid size-10 place-items-center rounded-full text-primary" />
        <div className="absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-[1px] bg-quaternary" aria-hidden="true">
          <div className="size-full origin-left scale-x-(--progress) bg-secondary" style={{ '--progress': progress } as React.CSSProperties} />
        </div>
      </div>
    </div>
  );
}

// ---- Coming Up (shell/UpNext.tsx) ----------------------------------------------

function ComingUpRow({ title, artist, art, at, past }: { title: string; artist: string; art: string; at?: string; past?: boolean }) {
  return (
    <li className="group/row relative grid h-[55px] grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-x-3 rounded-row px-2.5 hover:bg-quinary" data-past={past || undefined}>
      <div className="relative size-10">
        <Artwork src={art} radius="var(--radius-artwork-small)" />
      </div>
      <div className="flex min-w-0 flex-col text-start">
        <span className="truncate type-body text-primary">{title}</span>
        <span className="truncate type-body text-secondary">{artist}</span>
      </div>
      <span className="justify-self-end type-body tabular-nums text-secondary">{at}</span>
    </li>
  );
}

export function ComingUp() {
  return (
    <>
      <div className="flex items-center gap-1.5 px-5 pt-[23px] pb-3">
        <h3 className="flex-1 type-title-2-emphasized">Coming Up</h3>
      </div>
      <p className="truncate px-5 pb-2 type-callout text-secondary">
        Playing from {show.title} · {show.kind}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[120px] [scrollbar-width:thin]">
        <ol className={list}>
          {comingUp.map((s) => (
            <ComingUpRow key={s.id} title={s.title} artist={s.artist} art={s.art} at={s.at} />
          ))}
        </ol>
        <h4 className="mx-2.5 mt-[18px] mb-0.5 flex items-center gap-1.5 type-callout-emphasized">Recently Played</h4>
        <p className="mx-2.5 mb-2 type-callout text-secondary">Earlier on FTN Radio.</p>
        <ol className={list}>
          {recentlyPlayed.slice(0, 4).map((s) => (
            <ComingUpRow key={s.id} title={s.title} artist={s.artist} art={s.art} at={fmt(s.durationSec)} past />
          ))}
        </ol>
      </div>
    </>
  );
}

// ---- SidePanel (shell/SidePanel.tsx) -------------------------------------------

export function SidePanel() {
  const { sidePanel, fullScreen } = useUi();
  if (!sidePanel || fullScreen) return null;
  return (
    <aside
      className="absolute inset-y-0 right-0 z-(--z-web-chrome) flex w-(--side-panel-width) animate-slide-in flex-col glass-material shadow-glass max-sm:w-full"
      aria-label={sidePanel === 'up-next' ? 'Coming Up' : 'Lyrics'}
    >
      {sidePanel === 'up-next' ? (
        <ComingUp />
      ) : (
        <>
          <div className="flex items-center justify-between px-4 pt-4 pb-1">
            <span className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1 type-callout-emphasized text-secondary">Lyrics</span>
          </div>
          <Lyrics full={false} startSec={nowPlaying.elapsedSec} />
        </>
      )}
    </aside>
  );
}

// ---- AppShell (shell/AppShell.tsx) -----------------------------------------------

export function AppShell({
  active,
  children,
  panel = null,
  fullScreen: fullScreenAtStart = false,
  fullScreenPanel = 'lyrics',
}: {
  active: string;
  children: ReactNode;
  panel?: Panel;
  fullScreen?: boolean;
  fullScreenPanel?: 'lyrics' | 'queue' | null;
}) {
  const [sidePanel, setSidePanel] = useState<Panel>(panel);
  const [fullScreen, setFullScreen] = useState(fullScreenAtStart);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [listening, setListening] = useState(true);
  // Phones: the panel would cover the page, so it starts closed there.
  useEffect(() => {
    if (window.innerWidth < 484) setSidePanel(null);
  }, []);
  const ui: Ui = {
    sidePanel,
    toggleSidePanel: (p) => setSidePanel((on) => (on === p ? null : p)),
    fullScreen,
    setFullScreen,
    fullScreenPanel,
    drawerOpen,
    setDrawerOpen,
    listening,
    setListening,
  };
  return (
    <UiContext.Provider value={ui}>
      <div className="grid h-full grid-rows-[minmax(0,1fr)_auto]">
        <div className="relative min-h-0 overflow-hidden">
          <Sidebar active={active} />
          <MobileTopBar />
          <main
            id="scrollable-page"
            className="absolute inset-0 overflow-x-hidden overflow-y-auto pl-(--web-navigation-width) [scrollbar-gutter:stable] max-sm:pt-(--mobile-top-bar-height) max-sm:pl-0"
          >
            <div className="min-h-full pb-[calc(var(--player-pill-height)+var(--player-bottom-offset)+40px)]">{children}</div>
          </main>
          <RadioPill />
          <MiniPlayer />
          <SidePanel />
        </div>
        {fullScreen && <RadioFullScreen />}
      </div>
    </UiContext.Provider>
  );
}
