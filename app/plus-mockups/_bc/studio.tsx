'use client';
/*
 * The broadcaster's Studio, in BitChord's grouped rows (settingsStyles.ts:
 * the Settings, Extension and Listen Together pages) and its Up Next rows.
 */
import { Copy, GripVertical, Mic, MicOff, Pause, PhoneOff, SkipForward } from 'lucide-react';
import { callersOnAir, comingUp, nowPlaying, show, waitingRoom } from './data';
import { LevelMeter } from './standalone';
import { settingsUi } from './styles';
import { Artwork, detailButton, LiveBadge, PageHeader } from './ui';

/**
 * settingsUi.switch, drawn on a span: the site's globals.css styles every
 * checkbox outside any layer, which outranks BitChord's utilities. (Moving
 * FTN+ over means putting those rules in a layer.)
 */
function Switch({ on }: { on: boolean }) {
  return (
    <span
      role="switch"
      aria-checked={on}
      className="relative h-[22px] w-[38px] flex-none rounded-[11px] bg-quaternary transition-[background-color] duration-200 aria-checked:bg-green after:absolute after:top-0.5 after:left-0.5 after:size-[18px] after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgb(0_0_0/0.3)] after:transition-[translate] after:duration-200 aria-checked:after:translate-x-4"
    />
  );
}

const small = 'grid size-7 place-items-center rounded-full bg-quaternary text-primary hover:bg-quinary';

function Section({ title, aside, children, footer }: { title: string; aside?: string; children: React.ReactNode; footer?: string }) {
  return (
    <section>
      <h2 className={`${settingsUi.sectionHeader} flex justify-between`}>
        <span>{title}</span>
        {aside && <span className="normal-case">{aside}</span>}
      </h2>
      <div className={settingsUi.group}>{children}</div>
      {footer && <p className={settingsUi.footer}>{footer}</p>}
    </section>
  );
}

export function StudioPage() {
  const progress = nowPlaying.elapsedSec / nowPlaying.durationSec;
  return (
    <>
      <PageHeader title="Studio">
        <span className="flex items-center gap-2 pb-1.5 type-callout text-secondary">
          <LiveBadge /> {show.title} · {show.listeners} listening
        </span>
      </PageHeader>

      <div className="mx-(--body-gutter) mt-2 mb-10 grid grid-cols-2 gap-x-8 max-lg:grid-cols-1">
        <div>
          <Section title="On Air">
            <div className="relative grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-4 px-4 py-3.5">
              <Artwork src={nowPlaying.art} radius="var(--radius-artwork-small)" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate type-title-3-emphasized">{nowPlaying.title}</span>
                <span className="truncate type-body text-secondary">
                  {nowPlaying.artist} · {show.title} ({show.kind})
                </span>
                <div className="mt-2 h-1 overflow-hidden rounded-[999px] bg-quaternary">
                  <div className="size-full origin-left scale-x-(--progress) bg-secondary" style={{ '--progress': progress } as React.CSSProperties} />
                </div>
              </div>
            </div>
            <div className="relative flex flex-wrap items-center gap-3 px-4 pt-1 pb-4">
              <button className={detailButton.pill}>
                <Pause size={17} fill="currentColor" strokeWidth={0} />
                <span>Pause Music</span>
              </button>
              <button className={detailButton.circle} aria-label="Skip song" title="Skip song">
                <SkipForward size={17} strokeWidth={2.2} />
              </button>
              <button className={`${detailButton.circle} !bg-key-bg !text-white !border-transparent`} aria-label="Mic is live" title="Mic is live">
                <Mic size={17} strokeWidth={2.2} />
              </button>
              <span className="flex items-center gap-2 type-callout text-secondary">
                <LevelMeter /> Your mic
              </span>
            </div>
          </Section>

          <Section title="Sound" footer="Music lowers under any voice on air, then comes back up after a second of quiet.">
            <label className={settingsUi.controlRow}>
              <span>Microphone</span>
              <span className={settingsUi.value}>Shure MV7 (USB)</span>
            </label>
            <label className={settingsUi.controlRow}>
              <span>Lower music under voices</span>
              <Switch on />
            </label>
            <label className={settingsUi.controlRow}>
              <span className={settingsUi.rowText}>
                <span>Music level while talking</span>
                <span className={settingsUi.rowDetail}>20%</span>
              </span>
              <span className="h-1 w-[180px] overflow-hidden rounded-[2px] bg-quaternary max-sm:w-[110px]">
                <span className="block h-full w-1/5 bg-primary" />
              </span>
            </label>
          </Section>

          <Section title="Coming Up" aside="Drag to reorder">
            <ol className="py-1">
              {comingUp.slice(0, 5).map((s) => (
                <li key={s.id} className="group/row relative grid h-[55px] grid-cols-[16px_40px_minmax(0,1fr)_40px] items-center gap-x-3 px-3 hover:bg-quinary">
                  <GripVertical size={15} className="text-tertiary" />
                  <Artwork src={s.art} radius="var(--radius-artwork-small)" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate type-body">{s.title}</span>
                    <span className="truncate type-body text-secondary">{s.artist}</span>
                  </span>
                  <span className="justify-self-end type-body tabular-nums text-secondary">{s.at}</span>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div>
          <Section title="Callers on Air" aside="2 of 4">
            {callersOnAir.map((c) => (
              <div key={c.name} className={`${settingsUi.integration} grid-cols-[32px_minmax(0,1fr)_auto] hairline-[60px]`}>
                <span className="w-8">
                  <Artwork src={c.art} radius="50%" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{c.display}</span>
                  <span className="truncate type-callout text-secondary">@{c.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  <LevelMeter live={c.talking} />
                  <button className={small} aria-label={`Mute ${c.display}`}>
                    <MicOff size={14} />
                  </button>
                  <button className={`${small} !text-red`} aria-label={`Hang up on ${c.display}`}>
                    <PhoneOff size={14} />
                  </button>
                </span>
              </div>
            ))}
            {[0, 1].map((i) => (
              <div key={i} className={`${settingsUi.integration} grid-cols-[32px_minmax(0,1fr)] hairline-[60px] text-tertiary`}>
                <span className="size-8 rounded-full border border-dashed border-quaternary" />
                <span className="type-body">Open line</span>
              </div>
            ))}
          </Section>

          <Section title="Waiting Room" aside="5 of 20" footer="Callers stay in the waiting room until you put them on air. Up to 4 on air and 20 waiting.">
            {waitingRoom.map((c) => (
              <div key={c.name} className={`${settingsUi.integration} grid-cols-[32px_minmax(0,1fr)_auto] hairline-[60px]`}>
                <span className="relative w-8">
                  <Artwork src={c.art} radius="50%" />
                  <span className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-(--pageBG) ${c.micOk ? 'bg-green' : 'bg-gray'}`} title={c.micOk ? 'Mic checked' : 'No mic check yet'} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">
                    {c.display} <span className="type-callout text-secondary">@{c.name}</span>
                  </span>
                  <span className="truncate type-callout text-secondary">{[c.note, c.waited].filter(Boolean).join(' · ')}</span>
                </span>
                <button className={`${settingsUi.inlineButton} !bg-key-bg !text-white`}>Put on Air</button>
              </div>
            ))}
          </Section>

          <Section title="Invite Callers">
            <div className={`${settingsUi.row} gap-3`}>
              <span className="min-w-0 truncate type-body text-secondary">ftn.euno.cc/call/late-night-drive-7Q2K</span>
              <button className={`${settingsUi.inlineButton} inline-flex items-center gap-1`}>
                <Copy size={12} /> Copy
              </button>
            </div>
            <label className={settingsUi.controlRow}>
              <span>Open the waiting room</span>
              <Switch on />
            </label>
          </Section>
        </div>
      </div>
    </>
  );
}
