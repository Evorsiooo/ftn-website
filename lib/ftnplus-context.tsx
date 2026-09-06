"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { SwimlaneVideo } from "@/components/ott/ott-swimlane";

export interface CustomSwimlaneData {
  id: string;
  title: string;
  videos: any[];
}

export interface FTNPlusContextType {
  featuredVideo: any | null;
  trendingVideos: SwimlaneVideo[];
  customSwimlanes: CustomSwimlaneData[];
  allVideos: any[];
  loadingLibrary: boolean;
  error: string | null;
  refreshLibrary: () => Promise<void>;
}

const FTNPlusContext = createContext<FTNPlusContextType | undefined>(undefined);

export function FTNPlusProvider({ children }: { children: React.ReactNode }) {
  const [featuredVideo, setFeaturedVideo] = useState<any | null>(null);
  const [trendingVideos, setTrendingVideos] = useState<SwimlaneVideo[]>([]);
  const [customSwimlanes, setCustomSwimlanes] = useState<CustomSwimlaneData[]>([]);
  const [allVideos, setAllVideos] = useState<any[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = useCallback(async (retryCount = 0) => {
    try {
      setError(null);
      const res = await fetch("/api/plus/videos");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as any;
      if (data) {
        if (data.featuredVideo) {
          setFeaturedVideo(data.featuredVideo);
        } else if (Array.isArray(data.videos) && data.videos.length > 0) {
          setFeaturedVideo(data.videos[0]);
        } else {
          setFeaturedVideo(null);
        }

        if (Array.isArray(data.videos)) {
          setAllVideos(data.videos);
        }

        if (Array.isArray(data.trendingVideos)) {
          const mappedTrending: SwimlaneVideo[] = data.trendingVideos.map((v: any) => ({
            id: v.youtubeId || v.id,
            title: v.title,
            category: v.channelTitle || "FTN+",
            thumbnailUrl: v.thumbnailUrl,
            channelId: v.channelId,
            channelTitle: v.channelTitle,
            channelLogoUrl: v.channelLogoUrl,
            duration: v.isLive ? "LIVE" : "HD",
            isLive: v.isLive,
          }));
          setTrendingVideos(mappedTrending);
        }

        if (Array.isArray(data.customSwimlanes)) {
          setCustomSwimlanes(data.customSwimlanes);
        }
      }
      setLoadingLibrary(false);
    } catch (err: any) {
      console.warn(`FTNPlus fetch attempt ${retryCount + 1} failed:`, err);
      // Automatic retry with exponential backoff if initial attempt fails
      if (retryCount < 2) {
        setTimeout(() => {
          fetchVideos(retryCount + 1);
        }, (retryCount + 1) * 800);
      } else {
        setError(err?.message || "Failed to load library");
        setLoadingLibrary(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  return (
    <FTNPlusContext.Provider
      value={{
        featuredVideo,
        trendingVideos,
        customSwimlanes,
        allVideos,
        loadingLibrary,
        error,
        refreshLibrary: async () => fetchVideos(0),
      }}
    >
      {children}
    </FTNPlusContext.Provider>
  );
}

export function useFTNPlus() {
  const context = useContext(FTNPlusContext);
  if (!context) {
    throw new Error("useFTNPlus must be used within an FTNPlusProvider");
  }
  return context;
}
