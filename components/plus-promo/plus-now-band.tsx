"use client";
import React from "react";
import Link from "next/link";
import { IconHeadphones, IconPlayerPlay } from "@tabler/icons-react";
import { useSiteConfig } from "@/lib/site-config-context";
import { openRadioPopout, plusHref, watchPath, type PlusRef } from "@/lib/plus-links";
import { usePlusNow } from "./plus-now-context";
import { FtnPlusLogo } from "./ftn-plus-logo";
import {
  PromoCard,
  PromoLink,
  formatClock,
  formatIn,
  goldButtonClass,
  panelClass,
  sportsTitle,
  useNow,
} from "./promo-parts";
import { cn } from "@/lib/utils";

/** Cards for what is on FTN+ besides the featured stream. Empty when there is nothing to say. */
function useCards(excludeLiveId?: string | null, pref: PlusRef = "band") {
  const { data } = usePlusNow();
  const { webradioEnabled } = useSiteConfig();
  const now = useNow();
  const cards: React.ReactElement[] = [];

  for (const v of data.live.filter((l) => l.id !== excludeLiveId)) {
    cards.push(
      <PromoCard
        key={`live-${v.id}`}
        art={v.thumbnailUrl}
        eyebrow="Live now"
        eyebrowClass="text-red-600 dark:text-red-400"
        title={v.title}
        sub={v.channelTitle}
        action={
          <PromoLink href={watchPath(v.id)} pref={pref}>
            <IconPlayerPlay className="h-3.5 w-3.5 fill-current" /> Watch
          </PromoLink>
        }
      />
    );
  }

  if (webradioEnabled) {
    cards.push(
      <PromoCard
        key="radio"
        art={data.radio?.artUrl}
        eyebrow={data.radio ? "FTN Radio · On air" : "FTN Radio"}
        title={data.radio?.show ?? "Music, 24/7"}
        sub={data.radio?.presenter ? `with ${data.radio.presenter}` : "Listen while you read"}
        action={
          <button type="button" onClick={openRadioPopout} className={goldButtonClass}>
            <IconHeadphones className="h-3.5 w-3.5" /> Listen
          </button>
        }
      />
    );
  }

  const sports = data.result ?? data.upcoming;
  if (sports) {
    const isResult = sports === data.result;
    cards.push(
      <PromoCard
        key="sports"
        eyebrow={isResult ? `${sports.leagueName} · Final${sports.overtime ? " · OT" : ""}` : `Sports · ${formatIn(new Date(sports.startsAt).getTime() - now)}`}
        eyebrowClass="text-blue-600 dark:text-blue-400"
        title={sportsTitle(sports)}
        sub={isResult ? sports.label : `${sports.label} · ${formatClock(sports.startsAt)}`}
        action={<PromoLink href={`/plus/sports/${sports.leagueSlug}`} pref={pref}>{isResult ? "Results" : "Calendar"}</PromoLink>}
      />
    );
  }

  if (data.next) {
    const start = new Date(data.next.start).getTime();
    cards.push(
      <PromoCard
        key="next"
        eyebrow={`Next · ${formatIn(start - now)}`}
        eyebrowClass="text-neutral-500 dark:text-neutral-400"
        title={data.next.title}
        sub={`${formatClock(data.next.start)} your time`}
        action={<PromoLink href="/plus/schedule" pref={pref}>Schedule</PromoLink>}
      />
    );
  }
  return cards;
}

/** "On FTN+ right now": up to three cards, shown under the live hero. */
export function PlusNowBand({ excludeLiveId, className }: { excludeLiveId?: string | null; className?: string }) {
  const { loaded } = usePlusNow();
  const cards = useCards(excludeLiveId, "band").slice(0, 3);
  if (loaded && cards.length === 0) return null;
  return (
    <section aria-label="On FTN+ right now" className={cn(panelClass, "p-4 sm:p-5", className)}>
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
          On <FtnPlusLogo className="h-5" /> right now
        </div>
        <Link href={plusHref("/plus", "band")} prefetch={false} className="text-xs font-semibold text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white">
          Open FTN+ →
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {loaded ? cards : [0, 1, 2].map((i) => <div key={i} className="h-[96px] animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-900" />)}
      </div>
    </section>
  );
}

/** One-line FTN+ strip for days when nothing is live. */
export function PlusNowStrip({ className }: { className?: string }) {
  const { data, loaded } = usePlusNow();
  const { webradioEnabled } = useSiteConfig();
  const now = useNow();

  const items: { label: string; value: string; extra?: string; live?: boolean }[] = [];
  if (data.live[0]) items.push({ label: "Live now", value: data.live[0].title, live: true });
  if (data.next) items.push({ label: "Next", value: data.next.title, extra: formatIn(new Date(data.next.start).getTime() - now) });
  else if (data.upcoming) items.push({ label: "Next", value: sportsTitle(data.upcoming), extra: formatIn(new Date(data.upcoming.startsAt).getTime() - now) });
  if (webradioEnabled && data.radio) items.push({ label: "Radio", value: data.radio.show });
  if (data.result) items.push({ label: "Latest", value: sportsTitle(data.result) });

  if (loaded && items.length === 0) return null;
  const href = data.live[0] ? watchPath(data.live[0].id) : "/plus";

  return (
    <div className={cn("flex min-h-[54px] items-center gap-4 rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:shadow-none", className)}>
      <FtnPlusLogo className="h-6 flex-none" />
      {loaded ? (
        <div className="flex min-w-0 flex-1 items-center gap-5 overflow-hidden">
          {items.map((it, i) => (
            <div key={it.label} className={cn("min-w-0 items-center gap-2 whitespace-nowrap", i === 0 ? "flex" : "hidden lg:flex")}>
              {it.live ? <span className="h-2 w-2 flex-none rounded-full bg-red-500" /> : <span className="hidden text-neutral-400 sm:inline dark:text-neutral-500">{it.label}</span>}
              {it.live && <span className="text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-400">Live</span>}
              <b className="truncate font-bold">{it.value}</b>
              {it.extra && <span className="font-mono text-xs font-semibold text-neutral-500 dark:text-neutral-400">{it.extra}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="h-4 flex-1 animate-pulse rounded bg-neutral-100 dark:bg-neutral-900" />
      )}
      <Link href={plusHref(href, "strip")} prefetch={false} className={goldButtonClass}>
        {data.live[0] ? "Watch" : "Open FTN+"}
      </Link>
    </div>
  );
}

/** "Keep watching on FTN+" card for the end of an article. */
export function PlusEndCard({ className }: { className?: string }) {
  const { loaded } = usePlusNow();
  const cards = useCards(null, "article").slice(0, 2);
  if (!loaded || cards.length === 0) return null;
  return (
    <section aria-label="More on FTN+" className={cn(panelClass, "p-4 sm:p-5", className)}>
      <div className="mb-3 flex items-center gap-2 px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
        Keep watching on <FtnPlusLogo className="h-5" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{cards}</div>
    </section>
  );
}
