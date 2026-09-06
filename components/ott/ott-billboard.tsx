"use client";
import React from "react";
import Link from "next/link";
import { IconPlayerPlay, IconInfoCircle } from "@tabler/icons-react";

export interface BillboardItem {
  id: string;
  title: string;
  description: string;
  category: string;
  backdropUrl: string;
  isLive?: boolean;
}

export function OTTBillboard({
  item,
}: {
  item: BillboardItem;
}) {
  return (
    <div className="relative w-full h-[65vh] min-h-[440px] max-h-[620px] overflow-hidden select-none">
      {/* Background Image / Backdrop */}
      <img
        src={item.backdropUrl}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover object-center"
      />

      {/* Cinematic Vignette & Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/60 to-transparent w-full md:w-3/4" />

      {/* Content Container */}
      <div className="relative z-10 h-full flex flex-col justify-end px-6 md:px-12 pb-14 max-w-4xl space-y-4">
        {item.isLive && (
          <div>
            <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
              LIVE
            </span>
          </div>
        )}

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight drop-shadow-md">
          {item.title}
        </h1>

        <p className="text-sm sm:text-base text-neutral-300 line-clamp-3 leading-relaxed max-w-2xl drop-shadow">
          {item.description}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link href={`/plus/watch/${item.id}`}>
            <button className="gap-2 font-black px-7 h-12 text-sm rounded-lg bg-[#FFBB14] hover:bg-[#e5a710] text-black shadow-[0px_2px_0px_0px_#FFFFFF40_inset] flex items-center justify-center transition duration-200 cursor-pointer">
              <IconPlayerPlay className="h-5 w-5 fill-current" />
              Watch Now
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
