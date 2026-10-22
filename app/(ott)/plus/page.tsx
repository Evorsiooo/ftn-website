"use client";
export const runtime = "edge";
import { OTTBillboard, BillboardItem } from "@/components/ott/ott-billboard";
import { OTTSwimlane } from "@/components/ott/ott-swimlane";
import { IconVideo } from "@tabler/icons-react";
import { PageShell } from "@/components/ftn/page";
import { Button, EmptyState, GUTTER } from "@/components/ftn/ui";
import { LaneSkeleton } from "@/components/ftn/media";
import { OnAirStrip } from "@/components/ftn/on-air-strip";
import { useFTNPlus } from "@/lib/ftnplus-context";

export default function FTNPlusHomePage() {
  const { featuredVideo, trendingVideos, customSwimlanes, loadingLibrary, error, refreshLibrary } = useFTNPlus();

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

  return (
    <PageShell>
      {billboardItem ? (
        <OTTBillboard item={billboardItem} />
      ) : !loadingLibrary ? (
        <div className={`pt-24 pb-10 ${GUTTER}`}>
          <EmptyState
            icon={<IconVideo />}
            title="FTN+ Streaming Library"
            description={
              error
                ? "Unable to connect to the streaming library. Please check your connection."
                : "No video channels synced yet. Check back soon for upcoming broadcasts and video."
            }
            action={error ? <Button onClick={() => refreshLibrary()}>Retry connection</Button> : undefined}
          />
        </div>
      ) : (
        <div className="relative h-[60vh] min-h-[420px] max-h-[560px] ftn-skeleton !rounded-none" aria-label="Loading FTN+ library" />
      )}

      <div className="relative z-20 -mt-10 space-y-10">
        <OnAirStrip />

        {loadingLibrary && !billboardItem ? <LaneSkeleton /> : null}

        {trendingVideos.length > 0 && <OTTSwimlane title="Trending on FTN+" videos={trendingVideos} />}

        {customSwimlanes.map((lane) => (
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
      </div>
    </PageShell>
  );
}
