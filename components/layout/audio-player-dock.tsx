"use client";
import React, { useState, useEffect } from "react";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { Play, Pause, Radio, ExternalLink } from "lucide-react";
import { useAudio } from "@/lib/audio-context";

export function AudioPlayerDock() {
  const [mounted, setMounted] = useState(false);
  const { isPlaying, togglePlay, nowPlaying, webradioEnabled } = useAudio();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !webradioEnabled) {
    return null;
  }

  const handlePopout = () => {
    if (typeof window !== "undefined") {
      window.open(
        "/radio/popout",
        "FTNRadioPopout",
        "width=420,height=520,resizable=no,scrollbars=no,status=no"
      );
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center">
      <HoverBorderGradient
        containerClassName="rounded-full shadow-2xl shadow-black/20 dark:shadow-black/80"
        className="flex items-center gap-3 bg-white text-neutral-900 border border-neutral-200 shadow-lg dark:bg-neutral-950 dark:text-white dark:border-neutral-800"
      >
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-red-600 dark:text-red-500 animate-pulse" />
        </div>

        <div className="flex flex-col text-left max-w-[140px] sm:max-w-[200px]">
          <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 dark:text-neutral-400">FTN Radio Live</span>
          <span className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            {nowPlaying.title}
          </span>
        </div>

        <div className="flex items-center gap-2 border-l border-neutral-200 dark:border-neutral-800 pl-3">
          <button
            onClick={togglePlay}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e2162b] hover:bg-[#c01223] text-white transition-colors cursor-pointer shadow-sm"
            aria-label={isPlaying ? "Pause Stream" : "Play Stream"}
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
          </button>

          <button
            onClick={handlePopout}
            className="hidden sm:flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-black dark:bg-neutral-900 dark:hover:bg-neutral-800 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer"
            title="Popout Mini Player"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </HoverBorderGradient>
    </div>
  );
}
