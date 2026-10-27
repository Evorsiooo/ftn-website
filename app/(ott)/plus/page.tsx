"use client";
export const runtime = "edge";
import { IconVideo } from "@tabler/icons-react";
import { OTTBillboard, BillboardItem } from "@/components/ott/ott-billboard";
import { OTTSwimlane } from "@/components/ott/ott-swimlane";
import { PageShell } from "@/components/ftn/page";
import { Button, EmptyState, GUTTER } from "@/components/ftn/ui";
import { Lane, LaneSkeleton, MediaCard } from "@/components/ftn/media";
import { ContinueWatching } from "@/components/ftn/continue-watching";
import { HomeSports, SportsGlass, useSportsHighlights } from "@/components/ftn/home-sports";
import { OnAirGlass, OnAirStrip } from "@/components/ftn/on-air-strip";
import { useSchedule, type ScheduleEntry } from "@/components/ftn/use-schedule";
import { useFTNPlus } from "@/lib/ftnplus-context";
import { useSportsData } from "@/lib/use-sports-data";
import { hhmm, localZone } from "@/lib/schedule-client";

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
  const { data: sports, loading: sportsLoading } = useSportsData();
  const { next: nextSports } = useSportsHighlights(sports);

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
      kicker: `Up next ${untilLabel(new Date(next.start).getTime() - now)}`,
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
  const latest = allVideos.slice(0, 8).map((v: any) => ({
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

  // The hero already is the live stream when it is live, so it is not repeated as an "on air" card.
  const heroLiveId = billboardItem?.isLive ? billboardItem.id : null;
  const onAir = live.filter((e) => !(heroLiveId && e.youtubeId === heroLiveId));

  return (
    <PageShell>
      {billboardItem ? (
        <OTTBillboard item={billboardItem} aside={
            <>
              <OnAirGlass live={onAir} now={now} max={nextSports ? 1 : 2} />
              <SportsGlass data={sports} />
            </>
          } />
      ) : !loadingHero ? (
        <div className={`pt-32 pb-10 ${GUTTER}`}>
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
        <div className="relative h-[78vh] min-h-[540px] max-h-[760px] ftn-skeleton !rounded-none" aria-label="Loading FTN+" />
      )}

      <div className="relative z-20 -mt-12 space-y-12">
        <OnAirStrip live={onAir} now={now} className={billboardItem ? "lg:hidden" : undefined} />

        {comingUp.length > 0 && (
          <Lane title="Coming up" sub={localZone()} href="/plus/schedule" hrefLabel="Full schedule" cols={4}>
            {comingUp.map((e) => {
              const start = new Date(e.start);
              return (
                <MediaCard
                  key={e.id + e.start}
                  href={entryHref(e)}
                  art={e.artUrl}
                  shape="poster"
                  title={e.title}
                  className="w-44 sm:w-52 md:w-56"
                  topLeft={
                    <div className="leading-tight">
                      <div className="ftn-display text-2xl">{hhmm(start)}</div>
                      <div className="text-xs font-semibold text-white/85">{dayLabel(start, now)}</div>
                    </div>
                  }
                >
                  {e.presenter && <p>with {e.presenter}</p>}
                </MediaCard>
              );
            })}
          </Lane>
        )}

        <ContinueWatching />

        <HomeSports data={sports} loading={sportsLoading} />

        {loadingLibrary && <LaneSkeleton />}

        {latest.length > 0 && <OTTSwimlane title="Latest videos" videos={latest} href="/plus/library" hrefLabel="Browse the library" />}
      </div>
    </PageShell>
  );
}
