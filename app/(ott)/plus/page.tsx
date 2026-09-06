"use client";
export const runtime = "edge";
import { OTTBillboard, BillboardItem } from "@/components/ott/ott-billboard";
import { OTTSwimlane } from "@/components/ott/ott-swimlane";
import { Video } from "lucide-react";
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
    <div className="min-h-screen bg-neutral-950 pb-20">
      {/* Hero Billboard Banner */}
      {billboardItem ? (
        <OTTBillboard item={billboardItem} />
      ) : !loadingLibrary ? (
        <div className="relative w-full h-[40vh] min-h-[300px] bg-gradient-to-br from-neutral-900 to-black flex items-center justify-center p-8 text-center">
          <div className="space-y-3 max-w-md">
            <Video className="h-10 w-10 text-[#FFBB14] mx-auto" />
            <h1 className="text-2xl font-black text-white">FTN+ Streaming Library</h1>
            <p className="text-xs text-neutral-400">
              {error
                ? "Unable to connect to streaming library. Please check your connection."
                : "No video channels synced yet. Check back soon for upcoming broadcasts and video features."}
            </p>
            {error && (
              <div className="pt-2">
                <button
                  onClick={() => refreshLibrary()}
                  className="px-4 py-2 text-xs font-bold bg-[#FFBB14] text-black rounded-lg hover:bg-[#e5a710] transition cursor-pointer"
                >
                  Retry Connection
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="h-[40vh] flex items-center justify-center text-xs text-neutral-500">
          Loading FTN+ library...
        </div>
      )}

      {/* Swimlanes Container */}
      <div className="relative z-20 -mt-16 space-y-8">
        {/* 1. Trending Swimlane (Most viewed on FTN within the last 7 days) */}
        {trendingVideos.length > 0 && (
          <OTTSwimlane title="Trending on FTN+" videos={trendingVideos} />
        )}

        {/* 2. Custom Swimlanes from Site Settings */}
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
    </div>
  );
}
