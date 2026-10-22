"use client";
export const runtime = "edge";
import { IconVideo } from "@tabler/icons-react";
import { OTTBillboard, BillboardItem } from "@/components/ott/ott-billboard";
import { OTTSwimlane } from "@/components/ott/ott-swimlane";
import { PageShell } from "@/components/ftn/page";
import { Button, EmptyState, GUTTER, Tag } from "@/components/ftn/ui";
import { ArtTile, CardSurface, LaneSkeleton } from "@/components/ftn/media";
import { ContinueWatching } from "@/components/ftn/continue-watching";
import { HomeSports } from "@/components/ftn/home-sports";
import { OnAirStrip } from "@/components/ftn/on-air-strip";
import { useSchedule, type ScheduleEntry } from "@/components/ftn/use-schedule";
import { useFTNPlus } from "@/lib/ftnplus-context";
import { hhmm, localZone } from "@/lib/schedule-client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";

const FALLBACK_BACKDROP = "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1600&auto=format&fit=crop&q=80";

function untilLabel(ms: number) {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `in ${h}h ${mins % 60}m`;
  return `in ${Math.floor(h / 24)}d ${h % 24}h`;
}

function dayLabel(d: Date, now: number) {
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return "Today";
  const tomorrow = new Date(now + 86400000);
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function entryHref(e: ScheduleEntry) {
  if (e.onStream && e.youtubeId) return `/plus/watch/${e.youtubeId}`;
  if (e.onRadio) return "/plus/radio";
  return "/plus/schedule";
}

/** Home: what is on FTN+ right now, what is next, and what is new. */
export default function FTNPlusHomePage() {
  const { featuredVideo, allVideos, loadingLibrary, error, refreshLibrary } = useFTNPlus();
  const { live, upcoming, loaded: scheduleLoaded, now } = useSchedule();

  const next = upcoming[0];
  const featuredBackdrop = featuredVideo?.thumbnailUrl || FALLBACK_BACKDROP;

  // Context hero: a live stream, else the next broadcast within a day, else the featured video.
  let billboardItem: BillboardItem | null = null;
  if (featuredVideo?.isLive) {
    billboardItem = {
      id: featuredVideo.youtubeId || featuredVideo.id,
      title: featuredVideo.title,
      description: featuredVideo.description || "",
      category: featuredVideo.channelTitle || "FTN+ Original",
      backdropUrl: featuredBackdrop,
      isLive: true,
    };
  } else if (next && new Date(next.start).getTime() - now < 24 * 3600 * 1000) {
    billboardItem = {
      id: next.id,
      title: next.title,
      description: next.presenter ? `with ${next.presenter}` : "",
      category: next.onStream ? "Livestream" : "FTN Radio",
      backdropUrl: next.artUrl || featuredBackdrop,
      kicker: `Up next · ${untilLabel(new Date(next.start).getTime() - now)}`,
      href: "/plus/schedule",
      ctaLabel: "See the schedule",
    };
  } else if (featuredVideo) {
    billboardItem = {
      id: featuredVideo.youtubeId || featuredVideo.id,
      title: featuredVideo.title,
      description: featuredVideo.description || "",
      category: featuredVideo.channelTitle || "FTN+ Original",
      backdropUrl: featuredBackdrop,
    };
  }

  const comingUp = upcoming.slice(0, 4);
  const latest = allVideos.slice(0, 12).map((v: any) => ({
    id: v.youtubeId || v.id,
    title: v.title,
    category: v.channelTitle || "FTN+",
    thumbnailUrl: v.thumbnailUrl,
    channelId: v.channelId,
    channelTitle: v.channelTitle,
    channelLogoUrl: v.channelLogoUrl,
    isLive: v.isLive,
  }));

  const loadingHero = loadingLibrary || !scheduleLoaded;

  return (
    <PageShell>
      {billboardItem ? (
        <OTTBillboard item={billboardItem} />
      ) : !loadingHero ? (
        <div className={`pt-24 pb-10 ${GUTTER}`}>
          <EmptyState
            icon={<IconVideo />}
            title="Welcome to FTN+"
            description={
              error
                ? "Unable to connect to the streaming library. Please check your connection."
                : "Nothing is scheduled or published yet. Check back soon for broadcasts and video."
            }
            action={error ? <Button onClick={() => refreshLibrary()}>Retry connection</Button> : undefined}
          />
        </div>
      ) : (
        <div className="relative h-[60vh] min-h-[420px] max-h-[560px] ftn-skeleton !rounded-none" aria-label="Loading FTN+" />
      )}

      <div className="relative z-20 -mt-10 space-y-10">
        <OnAirStrip live={live} now={now} />

        {comingUp.length > 0 && (
          <section className={cn("space-y-3.5", GUTTER)}>
            <div className="flex items-end justify-between gap-4">
              <h2 className="ftn-title text-xl sm:text-2xl">
                Coming up <span className="text-sm font-normal text-ftn-text-3 ml-2">{localZone()}</span>
              </h2>
              <Link href="/plus/schedule" className="inline-flex items-center gap-0.5 text-xs text-ftn-text-2 hover:text-ftn-text">
                Full schedule <IconChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {comingUp.map((e) => {
                const start = new Date(e.start);
                return (
                  <CardSurface key={e.id + e.start} href={entryHref(e)} className="!flex-row items-center gap-3 p-3.5">
                    <ArtTile src={e.artUrl} className="h-14 w-14 flex-shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="ftn-mono text-sm text-ftn-text">{hhmm(start)}</span>
                        <span className="text-xs text-ftn-text-3">{dayLabel(start, now)}</span>
                      </div>
                      <div className="text-sm font-semibold truncate">{e.title}</div>
                      <Tag tone={e.onStream ? "neutral" : "brand"}>{e.onStream ? "Stream" : "Radio"}</Tag>
                    </div>
                  </CardSurface>
                );
              })}
            </div>
          </section>
        )}

        <ContinueWatching />

        <HomeSports />

        {loadingLibrary && <LaneSkeleton />}

        {latest.length > 0 && <OTTSwimlane title="Latest videos" videos={latest} href="/plus/library" hrefLabel="Browse the library" />}
      </div>
    </PageShell>
  );
}
