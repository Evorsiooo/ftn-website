'use client';
/*
 * FTN+ pages laid out with BitChord's page idioms: PageHeader, shelves of
 * lockups (HomePage), DetailHeader (album page), TrackList rows (playlist
 * page), CategoryTiles (Browse) and settingsUi groups. Classes are BitChord's;
 * the content is FTN+'s.
 */
import { Phone, Plus, Radio as RadioGlyph } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  art,
  days,
  fmt,
  leagues,
  nowPlaying,
  presenters,
  radioShows,
  recentlyPlayed,
  results,
  schedule,
  show,
  standings,
  upcomingMatches,
  videos,
  wide,
} from './data';
import { PlayIcon } from './icons';
import { seeAllGrid } from './styles';
import {
  Artwork,
  CircleLockup,
  detailButton,
  EditorialCard,
  HorizontalLockup,
  LiveBadge,
  PageHeader,
  Segmented,
  Shelf,
  SquareLockup,
  TrackLockup,
  VideoLockup,
} from './ui';

// ---- DetailHeader (components/music/DetailHeader.tsx) -------------------------

function DetailHeader({
  src,
  title,
  byline,
  meta,
  description,
  actions,
}: {
  src: string;
  title: ReactNode;
  byline: ReactNode;
  meta: string;
  description: string;
  actions: ReactNode;
}) {
  return (
    <div className="mx-(--body-gutter) mb-10 grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_1fr_auto] gap-x-[34px] pt-11 [grid-template-areas:'artwork_headings'_'artwork_description'_'artwork_actions'] max-md:grid-cols-[1fr] max-md:grid-rows-[auto] max-md:justify-items-center max-md:pt-4 max-md:text-center max-md:[grid-template-areas:'artwork'_'headings'_'actions'_'description']">
      <div className="relative w-[270px] self-start rounded-artwork-lg shadow-[0_10px_20px_0_var(--radiosityShadowColor)] [grid-area:artwork] max-lg:w-[220px] max-md:w-[min(270px,70vw)]">
        <div className="absolute inset-0 -z-1 scale-88 opacity-30 blur-[20px] saturate-200" aria-hidden="true">
          <Artwork src={src} radius="var(--radius-artwork-large)" />
        </div>
        <Artwork src={src} radius="var(--radius-artwork-large)" />
      </div>
      <div className="flex flex-col pt-[37px] [grid-area:headings] max-md:items-center max-md:pt-5">
        <h1 className="flex items-center gap-2 type-large-title-emphasized leading-[30px] max-md:justify-center">{title}</h1>
        <div className="type-large-title leading-[30px] text-primary">{byline}</div>
        <div className="mt-1 type-callout-emphasized text-secondary">{meta}</div>
      </div>
      <div className="mt-[38px] flex max-w-[440px] items-end type-body-tall text-secondary [grid-area:description] max-md:mt-5">
        <p className="line-clamp-3 min-w-0">{description}</p>
      </div>
      <div className="mt-3.5 flex items-center gap-3.5 self-end [grid-area:actions]">{actions}</div>
    </div>
  );
}

// ---- Radio ----------------------------------------------------------------------

export function RadioPage() {
  return (
    <>
      <DetailHeader
        src={show.art}
        title={
          <>
            {show.title} <LiveBadge />
          </>
        }
        byline="FTN Radio"
        meta={`${show.kind} · Now until ${show.until} · ${show.listeners} listening`}
        description="Every listener hears the same song at the same moment, mixed in the browser. Tonight: smooth late-night picks, with DJ Nova taking your calls between songs."
        actions={
          <>
            <button className={detailButton.pill}>
              <PlayIcon size={18} />
              <span>Listen Live</span>
            </button>
            <a href="/plus-mockups/waiting-room" className={detailButton.circle} aria-label="Call in" title="Call in">
              <Phone size={17} strokeWidth={2.2} />
            </a>
            <button className={detailButton.circle} aria-label="Save show" title="Save show">
              <Plus size={18} strokeWidth={2.4} />
            </button>
          </>
        }
      />
      <Shelf title="Recently Played" kind="tracks" to>
        {[nowPlaying, ...recentlyPlayed].map((s) => (
          <TrackLockup key={s.id} src={s.art} label={s.title} sub={s.artist} />
        ))}
      </Shelf>
      <Shelf title="Radio Shows" kind="square" to>
        {radioShows.map((s) => (
          <SquareLockup key={s.title} src={s.art} label={s.title} sub={s.subtitle} />
        ))}
      </Shelf>
      <Shelf title="Presenters" kind="circle">
        {presenters.map((p) => (
          <CircleLockup key={p.name} src={p.art} label={p.name} />
        ))}
      </Shelf>
    </>
  );
}

// ---- Home -----------------------------------------------------------------------

export function HomePage() {
  return (
    <>
      <PageHeader title="Home" />
      <Shelf title="" kind="editorial">
        {[
          <EditorialCard key="1" eyebrow="Live now" live label="FTN Evening News" sub="Priya Hale in the studio" src={wide('city')} caption="Watch live" />,
          <EditorialCard key="2" eyebrow="On FTN Radio" live label={show.title} sub={`${nowPlaying.title} · ${nowPlaying.artist}`} src={show.wideArt} caption="Listen live" />,
          <EditorialCard key="3" eyebrow="Sports · Today 20:00" label="Harrison Grand Prix, Round 6" sub="Harbor Circuit · Livestream and Radio" src={wide('cycling')} caption="Set a reminder" />,
        ]}
      </Shelf>
      <Shelf title="Coming Up" kind="square" to>
        {schedule
          .filter((e) => e.state !== 'done')
          .concat(schedule.slice(0, 3))
          .map((e) => (
            <SquareLockup
              key={e.id + e.title}
              src={e.art}
              label={e.title}
              sub={`${e.state === 'live' ? 'Now' : `Today ${e.start}`} · ${e.kind}`}
              badge={e.state === 'live' ? <LiveBadge /> : undefined}
            />
          ))}
      </Shelf>
      <Shelf title="Latest Videos" kind="video" to>
        {videos.map((v) => (
          <VideoLockup key={v.id} src={v.art} label={v.title} sub={v.subtitle} badge={v.live ? <LiveBadge /> : undefined} />
        ))}
      </Shelf>
      <Shelf title="Recently on FTN Radio" kind="tracks" to>
        {[nowPlaying, ...recentlyPlayed].map((s) => (
          <TrackLockup key={s.id} src={s.art} label={s.title} sub={s.artist} />
        ))}
      </Shelf>
      <Shelf title="Sports Results" kind="horizontal" to>
        {results.map((m, i) => (
          <HorizontalLockup key={i} src={m.art} meta={m.league} label={m.score ? `${m.home} ${m.score} ${m.away}` : `${m.home}: ${m.away}`} sub={m.when} />
        ))}
      </Shelf>
      <Shelf title="Radio Shows" kind="square" to>
        {radioShows.map((s) => (
          <SquareLockup key={s.title} src={s.art} label={s.title} sub={s.subtitle} />
        ))}
      </Shelf>
      <Shelf title="Presenters" kind="circle">
        {presenters.map((p) => (
          <CircleLockup key={p.name} src={p.art} label={p.name} />
        ))}
      </Shelf>
    </>
  );
}

// ---- Library ----------------------------------------------------------------------

export function LibraryPage() {
  return (
    <>
      <PageHeader title="Library" />
      <div className="mx-(--body-gutter) mt-5">
        <Segmented items={['All', 'Shows', 'News', 'Sports', 'Podcasts', 'Live']} selected={0} />
      </div>
      <div className={seeAllGrid} data-wide>
        {videos.map((v) => (
          <VideoLockup key={v.id} src={v.art} label={v.title} sub={v.subtitle} badge={v.live ? <LiveBadge /> : undefined} />
        ))}
      </div>
    </>
  );
}

// ---- Sports -------------------------------------------------------------------------

/** Browse's category bricks (components/music/CategoryTiles.tsx), with the photo always in. */
const tile =
  'relative flex aspect-video items-end overflow-hidden rounded-artwork-lg bg-[radial-gradient(120%_90%_at_100%_0%,color-mix(in_srgb,var(--tile-color)_70%,#fff)_0%,transparent_70%),linear-gradient(160deg,var(--tile-color),color-mix(in_srgb,var(--tile-color)_55%,#000))] px-3.5 py-3 text-white transition-[scale] duration-200 ease-panel hover:scale-[1.015]';

function LeagueTiles() {
  return (
    <section className="pt-9" aria-label="Leagues">
      <h2 className="mx-(--body-gutter) type-title-2-emphasized">Leagues</h2>
      <ul className="mx-(--body-gutter) mt-3 mb-8 grid grid-cols-4 gap-5 max-lg:grid-cols-3 max-[607px]:grid-cols-2 max-[607px]:gap-2.5">
        {leagues.map((l) => (
          <li key={l.title}>
            <a href="#" className={tile} style={{ '--tile-color': l.color } as React.CSSProperties}>
              { }
              <img src={l.art} alt="" className="absolute inset-0 size-full object-cover grayscale contrast-[1.05]" style={{ objectPosition: '50% 25%' }} />
              <span aria-hidden="true" className="absolute inset-0 mix-blend-multiply" style={{ background: 'color-mix(in srgb, var(--tile-color) 68%, #fff)' }} />
              <span aria-hidden="true" className="absolute inset-0 mix-blend-screen" style={{ background: 'color-mix(in srgb, var(--tile-color) 32%, #000)' }} />
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-3/5 bg-[linear-gradient(to_top,rgba(0,0,0,0.45),transparent)]" />
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2.5" style={{ background: 'var(--tile-color)' }} />
              <span className="relative type-title-2-emphasized [text-shadow:0_1px_8px_#0000004d] max-[607px]:type-title-3-emphasized">{l.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** TrackList's playlist rows (components/music/TrackList.tsx): hairlines, hover fill, 54px. */
const row = [
  'group/row relative grid items-center bg-transparent hover:bg-tracklist-hover',
  'data-current:bg-[color-mix(in_srgb,var(--systemPrimary)_12%,transparent)]',
  'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:border-t-[0.5px] before:border-t-divider',
  'hover:before:border-t-transparent data-current:before:border-t-transparent [&:hover+&]:before:border-t-transparent [&[data-current]+&]:before:border-t-transparent',
].join(' ');
const cell = 'flex h-full min-w-0 items-center';

function Standings() {
  const cols = 'grid-cols-[minmax(0,1fr)_repeat(5,44px)_52px] max-md:grid-cols-[minmax(0,1fr)_36px_44px]';
  return (
    <section className="pt-9" aria-label="Standings">
      <div className="mx-(--body-gutter) mb-3.5 flex items-center justify-between">
        <h2 className="type-title-2-emphasized">Harrison Football League</h2>
        <span className="type-callout text-secondary">Season 3 · Week 9</span>
      </div>
      <div className="mx-(--body-gutter)">
        <div className={`grid ${cols} px-3 pb-1.5 type-callout text-secondary`}>
          <span>Team</span>
          <span className="text-center max-md:hidden">P</span>
          <span className="text-center max-md:hidden">W</span>
          <span className="text-center max-md:hidden">D</span>
          <span className="text-center max-md:hidden">L</span>
          <span className="text-center">GD</span>
          <span className="text-end">Pts</span>
        </div>
        {standings.map((t) => (
          <div key={t.team} className={`${row} h-[54px] ${cols} rounded-[12px] px-3`} data-current={t.pos === 1 || undefined}>
            <div className={`${cell} gap-3`}>
              <span className="w-4 text-end type-body tabular-nums text-secondary">{t.pos}</span>
              <span className="w-10 flex-none">
                <Artwork src={t.art} radius="var(--radius-artwork-small)" />
              </span>
              <span className="truncate type-body">{t.team}</span>
            </div>
            {[t.played, t.won, t.drawn, t.lost].map((n, i) => (
              <span key={i} className="text-center type-body tabular-nums text-secondary max-md:hidden">
                {n}
              </span>
            ))}
            <span className="text-center type-body tabular-nums text-secondary">{t.gd}</span>
            <span className="text-end type-body-emphasized tabular-nums">{t.pts}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SportsPage() {
  return (
    <>
      <PageHeader title="Sports" />
      <Shelf title="" kind="editorial">
        {upcomingMatches.map((m, i) => (
          <EditorialCard key={m.title} eyebrow={`${m.league}`} live={i === 0} label={m.title} sub={`${m.when} · ${m.on}`} src={m.art} caption={i === 0 ? 'Starts in 2 hr' : undefined} />
        ))}
      </Shelf>
      <Shelf title="Latest Results" kind="horizontal" to>
        {results.map((m, i) => (
          <HorizontalLockup key={i} src={m.art} meta={m.league} label={m.score ? `${m.home} ${m.score} ${m.away}` : `${m.home}: ${m.away}`} sub={m.when} />
        ))}
      </Shelf>
      <Standings />
      <Shelf title="Highlights" kind="video" to>
        {videos
          .filter((v) => v.category === 'Sports')
          .map((v) => (
            <VideoLockup key={v.id} src={v.art} label={v.title} sub={v.subtitle} />
          ))}
      </Shelf>
      <LeagueTiles />
    </>
  );
}

// ---- Schedule -------------------------------------------------------------------------

export function SchedulePage() {
  return (
    <>
      <PageHeader title="Schedule">
        <span className="pb-1 type-callout text-secondary max-sm:hidden">Times in your time zone (CET)</span>
      </PageHeader>
      <div className="mx-(--body-gutter) mt-5">
        <Segmented items={days} selected={0} />
      </div>
      <div className="mx-(--body-gutter) mt-6 mb-10">
        {schedule.map((e) => {
          const live = e.state === 'live';
          const done = e.state === 'done';
          return (
            <div
              key={e.id}
              className={`${row} h-[64px] grid-cols-[96px_minmax(0,1fr)_120px_70px] rounded-[12px] max-md:grid-cols-[64px_minmax(0,1fr)_auto]`}
              data-current={live || undefined}
            >
              <div className={`${cell} flex-col items-start justify-center ps-3`}>
                <span className={`type-body-emphasized tabular-nums ${done ? 'text-secondary' : ''}`}>{e.start}</span>
                <span className="type-callout tabular-nums text-tertiary">{e.end}</span>
              </div>
              <div className={`${cell} gap-3`}>
                <div className="relative w-10 shrink-0">
                  <Artwork src={e.art} radius="var(--radius-artwork-small)" className={done ? 'opacity-60' : undefined} />
                  {live && (
                    <span className="absolute inset-0 grid place-items-center rounded-artwork-sm bg-[rgb(0_0_0/0.45)] text-white" aria-label="On air">
                      <RadioGlyph size={16} strokeWidth={2.2} />
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className={`flex min-w-0 items-center gap-2 type-body ${done ? 'text-secondary' : ''}`}>
                    <span className="truncate">{e.title}</span>
                    {live && <LiveBadge />}
                  </span>
                  <span className="truncate type-callout text-secondary">{e.host ?? 'FTN Radio'}</span>
                </div>
              </div>
              <div className={`${cell} type-callout text-secondary max-md:hidden`}>{e.kind}</div>
              <div className={`${cell} justify-end pe-3`}>
                {live ? (
                  <a href="/plus-mockups/radio" className="rounded-[12px] bg-pill-bg px-2.5 py-[3px] type-callout-emphasized text-pill">
                    Listen
                  </a>
                ) : done ? (
                  <span className="type-callout text-tertiary">Aired</span>
                ) : (
                  <button className="rounded-[12px] bg-quaternary px-2.5 py-[3px] type-callout-emphasized text-primary">Remind</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export { art, fmt };
