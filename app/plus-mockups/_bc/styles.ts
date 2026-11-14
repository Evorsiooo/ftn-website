// Ported verbatim from BitChord (GPL-3.0) web/app/src/components/shelf.ts, pages/pageStyles.ts and pages/settingsStyles.ts at acf219a7.
/*
 * Horizontal shelves (report §2). Each kind sets its column count per
 * breakpoint, and the list lays out as
 *   grid-auto-columns: calc((100% - (n - 1) * gap) / n)
 * Below 1000px columns have a fixed width and the shelf scrolls by touch.
 */

/** What a shelf holds, named after it (Apple's letters in the comments). */
export type ShelfKind = 'editorial' | 'square' | 'tracks' | 'horizontal' | 'video' | 'circle';

export const shelfSection = 'pt-9';

export const shelfHeader = 'mx-(--body-gutter) mb-3.5 flex min-h-[22px] items-center type-title-2-emphasized';

/** The scrolling grid; a kind from `shelfKinds` fills in its rows, widths and column counts. */
export const shelfList = [
  'grid grid-flow-col grid-rows-[repeat(var(--rows),max-content)] auto-cols-(--xs-width) gap-x-2.5 gap-y-(--row-gap)',
  // 15px bleed so hover shadows aren't clipped (--standard-lockup-shadow-offset).
  '-my-[15px] px-(--body-gutter) py-[15px] scroll-px-(--body-gutter)',
  'overflow-x-auto overflow-y-hidden overscroll-x-none snap-x snap-mandatory scroll-smooth motion-reduce:scroll-auto',
  '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden *:min-w-0 *:snap-start',
  '[--gap:20px] [--n:var(--cols-s)] min-[1260px]:[--n:var(--cols-m)] min-[1580px]:[--n:var(--cols-l)] min-[1940px]:[--n:var(--cols-xl)]',
  'lg:auto-cols-[calc((100%-(var(--n)-1)*var(--gap))/var(--n))] lg:gap-x-(--gap)',
].join(' ');

export const shelfKinds: Record<ShelfKind, string> = {
  // A
  editorial: '[--rows:1] [--row-gap:24px] [--xs-width:298px] [--cols-s:2] [--cols-m:2] [--cols-l:3] [--cols-xl:3]',
  // G
  square: '[--rows:1] [--row-gap:24px] [--xs-width:144px] [--cols-s:4] [--cols-m:5] [--cols-l:6] [--cols-xl:6]',
  // TrackLockupsShelf
  tracks: '[--rows:4] [--row-gap:0px] [--xs-width:270px] [--cols-s:2] [--cols-m:3] [--cols-l:4] [--cols-xl:4]',
  // B
  horizontal: '[--rows:2] [--row-gap:24px] [--xs-width:298px] [--cols-s:2] [--cols-m:3] [--cols-l:4] [--cols-xl:4]',
  // C
  video: '[--rows:1] [--row-gap:24px] [--xs-width:200px] [--cols-s:3] [--cols-m:4] [--cols-l:5] [--cols-xl:5]',
  // H
  circle: '[--rows:1] [--row-gap:24px] [--xs-width:118px] [--cols-s:6] [--cols-m:8] [--cols-l:10] [--cols-xl:10]',
};

/** Album and playlist footer (report §3): 13px/18px secondary, release line, counts, label. */
export const detailFooter = 'mx-(--body-gutter) mt-[34px] px-3 pb-10 type-body-tall text-secondary';

/**
 * See All grids: the shelf's column counts, wrapping instead of scrolling
 * (report §2). `data-wide` for video lockups.
 */
export const seeAllGrid =
  'mx-(--body-gutter) mt-5 mb-10 grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-5 gap-y-6 data-wide:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] min-[1260px]:grid-cols-5 min-[1260px]:data-wide:grid-cols-4 min-[1580px]:grid-cols-6';

/** A track list under a See All grid. */
export const seeAllTracks = 'pt-7';
/*
 * Grouped inset rows, the settings idiom the app uses elsewhere: the
 * Extension, Settings, Discord and Listen Together pages.
 */

const row = 'relative flex items-center justify-between px-4 py-[11px] type-title-3 hairline-[16px]';
const integration = 'relative grid items-center gap-x-3 px-4 py-[11px] type-title-3 hairline-[52px]';
const field = 'w-[220px] flex-none rounded-[8px] border-0 bg-quaternary px-2.5 py-[5px] type-body text-primary';

export const settingsUi = {
  /** The page title and its rows as one column, centred in the page. */
  centered: 'mx-auto max-w-[calc(640px+2*var(--body-gutter))]',
  body: 'mx-(--body-gutter) mt-5 mb-[120px] max-w-[640px]',
  group: 'overflow-hidden rounded-[10px] bg-quinary',
  sectionHeader: 'mx-4 mt-7 mb-2 type-subhead-emphasized uppercase text-secondary',
  footer: 'mx-4 mt-2 type-callout text-secondary',

  row,
  /** A row holding a switch, a select or a field: the whole row is its label. */
  controlRow: `${row} cursor-pointer gap-4`,
  rowText: 'flex flex-col gap-0.5',
  rowDetail: 'type-callout text-secondary',
  value: 'inline-flex items-center gap-1.5 text-right type-body-reduced text-secondary',
  dot: 'size-2 rounded-full bg-green',

  /** Download rows: browser logo, title and detail, chevron. */
  download:
    'relative grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-[11px] hover:bg-quinary hairline-[60px]',
  updateDot: 'size-2.5 justify-self-center rounded-full bg-key',
  downloadText: 'flex min-w-0 flex-col gap-0.5',
  downloadTitle: 'type-title-3-emphasized text-key',
  downloadDetail: 'type-body text-secondary',
  chevron: 'text-tertiary',
  steps: 'mx-4 mt-2.5 list-decimal ps-[18px] type-body-tall text-secondary [&>li+li]:mt-1',

  /** Integration rows: a coloured app-icon square, the name, the state. */
  integration: `${integration} grid-cols-[24px_minmax(0,1fr)_auto]`,
  /** An integration row without the icon square. */
  integrationPlain: `${integration} grid-cols-[minmax(0,1fr)_auto]`,
  integrationIcon: 'grid size-6 place-items-center rounded-[6px] text-white',
  integrationName: 'min-w-0',
  /** Settings: an integration row that opens a page of its own. */
  linkRow: 'w-full cursor-pointer text-start hover:bg-quaternary',
  /** A row's own action, after its status (Connect, Disconnect). */
  inlineButton: 'ml-2 rounded-[12px] bg-quaternary px-2.5 py-[3px] type-callout-emphasized text-primary disabled:opacity-50',
  inlineLink: 'text-key',

  switch: [
    'relative h-[22px] w-[38px] flex-none cursor-pointer appearance-none rounded-[11px] bg-quaternary transition-[background-color] duration-200 checked:bg-green',
    'after:absolute after:top-0.5 after:left-0.5 after:size-[18px] after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgb(0_0_0/0.3)] after:transition-[translate] after:duration-200 checked:after:translate-x-4',
  ].join(' '),
  input: field,
};
