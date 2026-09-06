"use client";
export const runtime = "edge";
import React from "react";
import { Play, Pause, Radio } from "lucide-react";
import { useAudio } from "@/lib/audio-context";

export default function RadioPopoutPage() {
  const { isPlaying, togglePlay, nowPlaying } = useAudio();

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-white flex flex-col justify-between p-6 select-none">
      <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div className="flex items-center gap-2 font-black text-sm tracking-tight text-neutral-900 dark:text-white">
          <span>FTN RADIO</span>
        </div>
      </div>

      <div className="my-auto space-y-6 text-center">
        <div className="mx-auto h-24 w-24 rounded-full bg-neutral-100 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800 flex items-center justify-center">
          <Radio className="h-10 w-10 text-neutral-800 dark:text-white" />
        </div>

        <div className="space-y-1">
          <h2 className="font-bold text-base text-neutral-900 dark:text-white">{nowPlaying.title}</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{nowPlaying.artist}</p>
        </div>

        <div className="flex justify-center">
          <button
            onClick={togglePlay}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl transition-transform active:scale-95 cursor-pointer"
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
          </button>
        </div>
      </div>
    </div>
  );
}
