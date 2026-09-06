"use client";
export const runtime = "edge";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Vortex } from "@/components/ui/vortex";
import { ScheduleGrid } from "@/components/radio/schedule-grid";
import { Button } from "@/components/ui/button";
import { Play, Pause, ExternalLink } from "lucide-react";
import { useAudio } from "@/lib/audio-context";

export default function RadioPage() {
  const { isPlaying, togglePlay, nowPlaying, webradioEnabled } = useAudio();
  const router = useRouter();

  useEffect(() => {
    if (!webradioEnabled) {
      window.location.href = "https://euno.cc/";
    }
  }, [webradioEnabled]);

  if (!webradioEnabled) {
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
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-black dark:text-white px-4 sm:px-8 pt-24 sm:pt-28 pb-12 space-y-16">
      {/* Hero Visualizer Section with Vortex */}
      <div className="w-full mx-auto rounded-3xl h-[28rem] sm:h-[32rem] overflow-hidden relative border border-neutral-800 shadow-2xl">
        <Vortex
          backgroundColor="black"
          rangeY={800}
          particleCount={300}
          baseHue={0}
          className="flex items-center flex-col justify-center px-4 md:px-10 py-4 w-full h-full"
        >
          <div className="space-y-4 text-center max-w-2xl z-10">
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
              FTN Radio Live
            </h1>

            <p className="text-sm sm:text-base text-neutral-300">
              {nowPlaying.title}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <Button
                onClick={togglePlay}
                size="lg"
                className="font-bold text-sm px-8 rounded-full flex items-center gap-2"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPlaying ? "Pause" : "Listen Live"}
              </Button>

              <Button
                onClick={handlePopout}
                variant="outline"
                size="lg"
                className="rounded-full text-xs font-semibold flex items-center gap-2 border-neutral-700 bg-neutral-900/80 hover:bg-neutral-800 text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Popout Player
              </Button>
            </div>
          </div>
        </Vortex>
      </div>

      {/* Weekly Schedule Section */}
      <div id="schedule" className="container mx-auto max-w-7xl">
        <ScheduleGrid />
      </div>
    </div>
  );
}
