"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePlusNow } from "@/components/plus-promo/plus-now-context";
import { plusHref, watchPath } from "@/lib/plus-links";

/** One line under the masthead saying what is live on FTN+ right now. Renders nothing when nothing is, and not on the homepage while a stream is live, where the hero already says so. */
export function GsOnAir() {
  const { data } = usePlusNow();
  const pathname = usePathname();
  const live = data.live[0];
  const radio = data.radio;
  if (!live && !radio) return null;
  if (live && pathname === "/") return null;

  const text = live ? live.title : `${radio!.show}${radio!.presenter ? ` with ${radio!.presenter}` : ""}`;
  const href = live ? plusHref(watchPath(live.id), "strip") : plusHref("/plus/radio", "strip");

  return (
    <div className="bg-[#16110a] text-[#fff8e6]">
      <div className="mx-auto flex h-11 max-w-7xl items-center gap-3 px-4 text-sm sm:px-8">
        <span aria-hidden className="h-2.5 w-2.5 flex-none animate-pulse rounded-full bg-[#ff5a4d] shadow-[0_0_0_4px_rgba(255,90,77,0.25)]" />
        <span className="flex-none font-bold">{live ? "Live now" : "On air"}</span>
        <span className="min-w-0 flex-1 truncate opacity-70">{text}</span>
        <Link href={href} className="flex-none font-bold text-brand hover:underline">
          {live ? "Watch on FTN+" : "Listen on FTN+"} →
        </Link>
      </div>
    </div>
  );
}
