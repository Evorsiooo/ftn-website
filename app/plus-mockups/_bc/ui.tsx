'use client';
/*
 * BitChord's page components for the FTN+ mockups. Artwork, the lockups, the
 * shelf scroller, PageHeader and DetailHeader's buttons are BitChord's own
 * (web/app/src/components, GPL-3.0, acf219a7) with its data hooks taken out:
 * the class strings are unchanged. EditorialCard and Segmented follow
 * apple-music-dom.md (§2 "Editorial card", §9 segmented tokens), which
 * BitChord measured but never built.
 */
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PlayIcon } from './icons';
import { shelfHeader, shelfKinds, shelfList, shelfSection, type ShelfKind } from './styles';

// ---- Artwork (components/music/Artwork.tsx) ---------------------------------

const frame = 'relative isolate w-full overflow-hidden bg-joe artwork-stroke';

export function Artwork({
  src,
  aspect = 1,
  radius,
  className,
}: {
  src: string | null;
  aspect?: number;
  radius?: CSSProperties['borderRadius'];
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // Cached images can finish before React attaches onLoad.
  useEffect(() => {
    if (img.current?.complete) setLoaded(true);
  }, []);
  return (
    <div className={className ? `${frame} ${className}` : frame} style={{ aspectRatio: String(aspect), borderRadius: radius }}>
      {src && (
         
        <img
          ref={img}
          className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-250 ease-in data-loaded:opacity-100"
          data-loaded={loaded || undefined}
          src={src}
          alt=""
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  );
}

// ---- Lockups (components/music/Lockups.tsx) ---------------------------------

const lockup = 'flex min-w-0 flex-col';
const caption = 'mt-2 flex min-w-0 flex-col gap-px';
const title = 'flex min-w-0 items-center type-callout [&>:first-child]:truncate';
const subtitle = 'truncate type-callout text-secondary';

function PlayPlatter({ label }: { label: string }) {
  return (
    <button
      className="pointer-events-auto absolute bottom-2.5 left-2.5 grid size-[30px] place-items-center rounded-full bg-thin-material text-white [backdrop-filter:saturate(180%)_blur(60px)] hover:bg-key-bg"
      aria-label={`Play ${label}`}
    >
      <PlayIcon size={16} />
    </button>
  );
}

function LockupArtwork({ src, label, aspect, badge }: { src: string; label: string; aspect: number; badge?: ReactNode }) {
  return (
    <div className="group/art relative rounded-artwork-md">
      <Artwork src={src} aspect={aspect} radius="var(--radius-artwork-medium)" />
      <a href="#" className="absolute inset-0 z-1 rounded-[inherit]" aria-label={label} />
      <div className="pointer-events-none absolute inset-0 z-2 rounded-[inherit] bg-lockup-hover opacity-0 transition-opacity duration-100 ease-in group-focus-visible/art:opacity-100 group-hover/art:opacity-100">
        <PlayPlatter label={label} />
      </div>
      {badge && <div className="pointer-events-none absolute top-2 left-2 z-2">{badge}</div>}
    </div>
  );
}

/** Square lockup (report §2): artwork, hover scrim with play platter, title and subtitle. */
export function SquareLockup({ src, label, sub, badge }: { src: string; label: string; sub: ReactNode; badge?: ReactNode }) {
  return (
    <div className={lockup}>
      <LockupArtwork src={src} label={label} aspect={1} badge={badge} />
      <div className={caption}>
        <div className={title}>
          <a href="#" className="hover:underline">
            {label}
          </a>
        </div>
        <div className={subtitle}>{sub}</div>
      </div>
    </div>
  );
}

/** 16:9 video lockup (report §2, type C). */
export function VideoLockup({ src, label, sub, badge }: { src: string; label: string; sub: ReactNode; badge?: ReactNode }) {
  return (
    <div className={lockup}>
      <LockupArtwork src={src} label={label} aspect={16 / 9} badge={badge} />
      <div className={caption}>
        <div className={title}>
          <span>{label}</span>
        </div>
        <div className={subtitle}>{sub}</div>
      </div>
    </div>
  );
}

/** Circular artist lockup (report §2, type H). */
export function CircleLockup({ src, label }: { src: string; label: string }) {
  return (
    <a href="#" className="group/circle flex min-w-0 flex-col items-center gap-2.5">
      <Artwork src={src} radius="50%" />
      <span className="max-w-full truncate text-center type-body group-hover/circle:underline">{label}</span>
    </a>
  );
}

/** A song row inside a shelf (report §2, track lockup): 40px art, title, byline. */
export function TrackLockup({ src, label, sub }: { src: string; label: string; sub: ReactNode }) {
  return (
    <div className="group/track grid h-[55px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 py-[7.5px] pr-3.5 pl-0">
      <button className="group/art relative w-10 rounded-artwork-sm" aria-label={`Play ${label}`}>
        <Artwork src={src} radius="var(--radius-artwork-small)" />
        <span
          className="absolute inset-0 grid place-items-center rounded-[inherit] bg-lockup-hover text-white opacity-0 transition-opacity duration-100 ease-in group-hover/track:opacity-100 group-focus-visible/art:opacity-100"
          aria-hidden="true"
        >
          <PlayIcon size={16} />
        </span>
      </button>
      <div className="flex min-w-0 flex-col gap-px px-1">
        <div className="flex min-w-0 items-center type-body">
          <button className="min-w-0 truncate text-left">{label}</button>
        </div>
        <div className="truncate type-callout text-secondary">{sub}</div>
      </div>
      <button className="grid size-7 place-items-center rounded-full text-key opacity-0 transition-opacity duration-100 ease-in group-hover/track:opacity-100 focus-visible:opacity-100 hover:bg-quinary" aria-label="More">
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

/** Horizontal lockup (report §2, type B): 97px art left, title up to two lines, subtitle. */
export function HorizontalLockup({ src, label, sub, meta }: { src: string; label: string; sub: ReactNode; meta?: ReactNode }) {
  return (
    <a href="#" className="group/h grid grid-cols-[97px_minmax(0,1fr)] items-center gap-x-3.5">
      <Artwork src={src} radius="var(--radius-artwork-small)" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="type-subhead-emphasized text-secondary uppercase">{meta}</span>
        <span className="line-clamp-2 type-title-3 group-hover/h:underline">{label}</span>
        <span className="truncate type-callout text-secondary">{sub}</span>
      </div>
    </a>
  );
}

/**
 * Editorial card (report §2, type A): eyebrow 11px/14px 600 secondary, title
 * 13px/16px, then the 16:9 image (radius 10) with its caption over a scrim.
 */
export function EditorialCard({
  eyebrow,
  label,
  sub,
  src,
  caption: overlay,
  live,
}: {
  eyebrow: ReactNode;
  label: string;
  sub?: string;
  src: string;
  caption?: string;
  live?: boolean;
}) {
  return (
    <a href="#" className="group/ed flex min-w-0 flex-col">
      <span className={`type-subhead-emphasized uppercase ${live ? 'text-key' : 'text-secondary'}`}>{eyebrow}</span>
      <span className="truncate type-title-3">{label}</span>
      <span className="mb-2 truncate type-title-3 text-secondary">{sub ?? ' '}</span>
      <div className="relative overflow-hidden rounded-artwork-lg">
        <Artwork src={src} aspect={16 / 9} radius="var(--radius-artwork-large)" />
        {overlay && (
          <div className="absolute inset-x-0 bottom-0 z-1 bg-[linear-gradient(to_top,rgb(0_0_0/0.6),transparent)] px-4 pt-12 pb-3.5 type-title-3-emphasized text-white">
            {overlay}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 z-2 bg-lockup-hover opacity-0 transition-opacity duration-100 ease-in group-hover/ed:opacity-100" />
      </div>
    </a>
  );
}

// ---- Shelves (components/music/ShelfView.tsx) -------------------------------

const arrow =
  'absolute top-1/2 z-3 hidden h-13 w-7 -translate-y-1/2 place-items-center rounded-pill bg-thin-material text-secondary opacity-0 transition-[opacity,background-color,color] duration-(--duration-arrow) ease-linear [backdrop-filter:saturate(180%)_blur(60px)] hover:text-primary disabled:pointer-events-none lg:grid lg:enabled:group-hover/shelf:opacity-100';

export function ShelfScroller({ kind, children }: { kind: ShelfKind; children: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const measure = useCallback(() => {
    const el = list.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    measure();
    const el = list.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);
  const page = (direction: 1 | -1) => {
    const el = list.current;
    if (!el) return;
    const gutter = Number.parseFloat(getComputedStyle(el).paddingInlineStart) || 0;
    el.scrollBy({ left: direction * (el.clientWidth - gutter * 2), behavior: 'smooth' });
  };
  return (
    <div className="group/shelf relative">
      <button className={`${arrow} left-1.5`} aria-label="Previous Page" disabled={edges.start} onClick={() => page(-1)}>
        <ChevronLeft size={20} strokeWidth={2.4} />
      </button>
      <ul ref={list} className={`${shelfList} ${shelfKinds[kind]}`} onScroll={measure}>
        {children}
      </ul>
      <button className={`${arrow} right-1.5`} aria-label="Next Page" disabled={edges.end} onClick={() => page(1)}>
        <ChevronRight size={20} strokeWidth={2.4} />
      </button>
    </div>
  );
}

export function ShelfTitle({ title, to }: { title: string; to?: boolean }) {
  return (
    <div className={shelfHeader}>
      <h2 className="type-title-2-emphasized">
        {to ? (
          <a href="#" className="group/title inline-flex items-center gap-0.5">
            {title}
            <ChevronRight size={18} strokeWidth={2.6} className="text-secondary group-hover/title:text-primary" />
          </a>
        ) : (
          title
        )}
      </h2>
    </div>
  );
}

export function Shelf({ title, kind, to, children }: { title: string; kind: ShelfKind; to?: boolean; children: ReactNode[] }) {
  return (
    <section className={title ? shelfSection : 'pt-6'} aria-label={title || undefined}>
      {title && <ShelfTitle title={title} to={to} />}
      <ShelfScroller kind={kind}>
        {children.map((child, i) => (
          <li key={i}>{child}</li>
        ))}
      </ShelfScroller>
    </section>
  );
}

// ---- Page furniture ---------------------------------------------------------

/** The page title row (report §1, `.header-nav`). components/PageHeader.tsx. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-(--body-gutter) flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pt-8">
      <h1 className="type-header-emphasized">{title}</h1>
      {children}
    </div>
  );
}

/** Shuffle (circle) · Play (pill), report §14 (components/music/DetailHeader.tsx). */
export const detailButton = {
  pill: 'inline-flex h-9 min-w-[150px] items-center justify-center gap-1.5 rounded-[24px] bg-pill-bg px-3 type-title-3-emphasized text-pill disabled:opacity-40 enabled:hover:opacity-90',
  circle:
    'grid size-9 place-items-center rounded-full border-[0.75px] border-quaternary bg-quinary text-primary disabled:opacity-40 enabled:hover:bg-quaternary',
};

/** A segmented control in Apple's tokens (--segmentedControlBG / selected, report §9). */
export function Segmented({ items, selected }: { items: string[]; selected: number }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-[9px] bg-segmented p-0.5 [scrollbar-width:none]" role="tablist">
      {items.map((item, i) => (
        <button
          key={item}
          role="tab"
          aria-selected={i === selected}
          className="h-7 shrink-0 rounded-[7px] px-3.5 type-callout-medium whitespace-nowrap text-primary aria-selected:bg-segmented-selected aria-selected:shadow-[0_1px_3px_#0000001f,0_0_0_0.5px_#0000000a]"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

/** The "LIVE" badge: key colour, as Apple's live radio and live video lockups. */
export function LiveBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex h-[18px] items-center gap-1 rounded-[4px] bg-key-bg px-1.5 type-caption-2 tracking-[0.04em] text-white ${className}`}>
      <span className="size-1.5 animate-matching rounded-full bg-white" />
      LIVE
    </span>
  );
}
