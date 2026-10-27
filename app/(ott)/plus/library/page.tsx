"use client";
export const runtime = "edge";
import { useMemo, useState } from "react";
import { IconVideo } from "@tabler/icons-react";
import { OTTBillboard, BillboardItem } from "@/components/ott/ott-billboard";
import { OTTSwimlane } from "@/components/ott/ott-swimlane";
import { PageShell, PageHeader } from "@/components/ftn/page";
import { Button, Chip, EmptyState, GUTTER } from "@/components/ftn/ui";
import { ContinueWatching } from "@/components/ftn/continue-watching";
import { ChannelAvatar, LaneSkeleton, MediaCard } from "@/components/ftn/media";
import { useFTNPlus } from "@/lib/ftnplus-context";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 24;

type Filter = { kind: "all" } | { kind: "live" } | { kind: "livestreams" } | { kind: "replays" } | { kind: "channel"; name: string };

function matches(v: any, f: Filter) {
  switch (f.kind) {
    case "live":
      return !!v.isLive;
    case "livestreams":
      return v.videoType === "livestream";
    case "replays":
      return v.videoType === "livestream" && !v.isLive;
    case "channel":
      return v.channelTitle === f.name;
    default:
      return true;
  }
}

export default function LibraryPage() {
  const { featuredVideo, trendingVideos, customSwimlanes, allVideos, loadingLibrary, error, refreshLibrary } = useFTNPlus();
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [shown, setShown] = useState(PAGE_SIZE);

  const liveCount = useMemo(() => allVideos.filter((v) => v.isLive).length, [allVideos]);
  const hasStreams = useMemo(() => allVideos.some((v) => v.videoType === "livestream"), [allVideos]);
  const hasReplays = useMemo(() => allVideos.some((v) => v.videoType === "livestream" && !v.isLive), [allVideos]);
  const channels = useMemo(() => {
    const names = new Set<string>();
    allVideos.forEach((v) => v.channelTitle && names.add(v.channelTitle));
    return Array.from(names).sort();
  }, [allVideos]);

  const filtered = useMemo(() => allVideos.filter((v) => matches(v, filter)), [allVideos, filter]);
  const isAll = filter.kind === "all";

  const select = (f: Filter) => {
    setFilter(f);
    setShown(PAGE_SIZE);
  };
  const active = (f: Filter) => JSON.stringify(f) === JSON.stringify(filter);

  const billboardItem: BillboardItem | null = featuredVideo
    ? {
        id: featuredVideo.youtubeId || featuredVideo.id,
        title: featuredVideo.title,
        description: featuredVideo.description || "",
        category: featuredVideo.channelTitle || "FTN+ Original",
        backdropUrl:
          featuredVideo.thumbnailUrl ||
          "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=1600&auto=format&fit=crop&q=80",
        isLive: featuredVideo.isLive,
      }
    : null;

  if (!loadingLibrary && allVideos.length === 0) {
    return (
      <PageShell>
        <PageHeader eyebrow="FTN+" title="Library" subtitle="Livestreams, replays and originals from every FTN channel." />
        <div className={cn("pb-10", GUTTER)}>
          <EmptyState
            icon={<IconVideo />}
            title="Nothing in the library yet"
            description={
              error
                ? "Unable to connect to the streaming library. Please check your connection."
                : "No video channels synced yet. Check back soon for upcoming broadcasts and video."
            }
            action={error ? <Button onClick={() => refreshLibrary()}>Retry connection</Button> : undefined}
          />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {isAll && billboardItem && <OTTBillboard item={billboardItem} compact />}

      {!(isAll && billboardItem) && <PageHeader title="Library" subtitle="Livestreams, replays and originals from every FTN channel." />}

      <div className={cn("flex flex-wrap gap-2 pb-8", isAll && billboardItem && "pt-6", GUTTER)} role="group" aria-label="Filter videos">
        <Chip active={isAll} onClick={() => select({ kind: "all" })}>
          All
        </Chip>
        {liveCount > 0 && (
          <Chip active={active({ kind: "live" })} onClick={() => select({ kind: "live" })}>
            <span className="mr-2 h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
            Live now · {liveCount}
          </Chip>
        )}
        {hasStreams && (
          <Chip active={active({ kind: "livestreams" })} onClick={() => select({ kind: "livestreams" })}>
            Livestreams
          </Chip>
        )}
        {hasReplays && (
          <Chip active={active({ kind: "replays" })} onClick={() => select({ kind: "replays" })}>
            Replays
          </Chip>
        )}
        {channels.length > 1 &&
          channels.map((name) => (
            <Chip key={name} active={active({ kind: "channel", name })} onClick={() => select({ kind: "channel", name })}>
              {name}
            </Chip>
          ))}
      </div>

      <div className="space-y-10">
        {isAll && <ContinueWatching />}

        {loadingLibrary && <LaneSkeleton />}

        {isAll && trendingVideos.length > 0 && <OTTSwimlane title="Trending on FTN+" videos={trendingVideos} />}

        {isAll &&
          customSwimlanes.map((lane) => (
            <OTTSwimlane
              key={lane.id}
              title={lane.title}
              videos={lane.videos.map((v: any) => ({
                id: v.youtubeId || v.id,
                title: v.title,
                category: v.channelTitle || "FTN+",
                thumbnailUrl: v.thumbnailUrl,
                channelId: v.channelId,
                channelTitle: v.channelTitle,
                channelLogoUrl: v.channelLogoUrl,
                duration: v.isLive ? "LIVE" : "HD",
                isLive: v.isLive,
              }))}
            />
          ))}

        {!loadingLibrary && (
          <section className={cn("space-y-3.5", GUTTER)}>
            <h2 className="ftn-title text-xl sm:text-2xl">{isAll ? "All videos" : "Results"}</h2>
            {filtered.length === 0 ? (
              <EmptyState icon={<IconVideo />} title="No videos match" description="Try a different filter." />
            ) : (
              <>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  {filtered.slice(0, shown).map((v) => (
                    <MediaCard
                      key={v.id}
                      href={`/plus/watch/${v.youtubeId || v.id}`}
                      art={v.thumbnailUrl}
                      title={v.title}
                      live={v.isLive}
                      showPlay
                      lead={
                        <ChannelAvatar
                          logoUrl={v.channelLogoUrl}
                          title={v.channelTitle}
                          channelId={v.channelId}
                          fallbackText={v.channelTitle}
                        />
                      }
                    />
                  ))}
                </div>
                {shown < filtered.length && (
                  <div className="flex justify-center pt-4">
                    <Button variant="secondary" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                      Show more
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </PageShell>
  );
}
