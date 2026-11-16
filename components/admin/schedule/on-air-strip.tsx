"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Mic } from "lucide-react";
import { expandOccurrences } from "@/lib/schedule-core";
import type { Occurrence } from "@/lib/schedule-core";
import { fmtTime } from "@/lib/schedule-client";
import type { BroadcastRecord, ShowRecord } from "@/lib/schedule-client";
import { ObsPanel } from "./obs-panel";

/** The Studio for one airing of a broadcast. */
export const studioHref = (o: Pick<Occurrence, "broadcastId" | "start">) => `/admin/schedule/studio?b=${encodeURIComponent(o.broadcastId)}&at=${o.start.getTime()}`;

/** A radio airing someone hosts live (not a playlist or a relayed stream): it's run from the Studio. */
export const hostedOnRadio = (o: Pick<Occurrence, "onRadio" | "plays">) => o.onRadio && o.plays === "hosted";

/** Top of the Schedule page: what is on air or next, and the way to go on air for it (the Studio; OBS as the extra). */
export function OnAirStrip({ shows, broadcasts }: { shows: ShowRecord[]; broadcasts: BroadcastRecord[] }) {
  const [now, setNow] = useState(() => new Date());
  const [obs, setObs] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const upcoming: Occurrence[] = expandOccurrences(shows, broadcasts.filter((b) => b.onRadio), now, new Date(now.getTime() + 8 * 86400000), false);
  const current = upcoming.find((o) => o.start <= now && o.end > now) ?? null;
  const next = upcoming.find((o) => o.start > now) ?? null;
  // the show to open: the one on air, else the next one hosted live
  const target = current && hostedOnRadio(current) ? current : upcoming.find((o) => o.start > now && hostedOnRadio(o)) ?? null;

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-[#16110a] p-5 text-[#fff8e6] dark:bg-black lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        {current ? (
          <>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> On air
            </div>
            <div className="mt-1 truncate text-xl font-extrabold">{current.title}</div>
            <div className="text-sm text-[#fff8e6]/70">until {fmtTime(current.end)}{next ? ` · next: ${next.title}, ${fmtTime(next.start)}` : ""}</div>
          </>
        ) : (
          <>
            <div className="text-xs font-bold uppercase tracking-widest text-[#fff8e6]/60">Nothing on air</div>
            <div className="mt-1 truncate text-xl font-extrabold">{next ? `Next: ${next.title}` : "No radio shows scheduled"}</div>
            {next && <div className="text-sm text-[#fff8e6]/70">{next.start.toLocaleDateString(undefined, { weekday: "long" })} at {fmtTime(next.start)}</div>}
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2 lg:items-end">
        {target ? (
          <Link href={studioHref(target)} className="inline-flex h-11 items-center gap-2 self-start rounded-full bg-brand px-6 text-[15px] font-bold text-brand-ink hover:bg-brand-hover lg:self-end">
            <Mic className="h-4 w-4" /> Open Studio{target !== current ? `: ${target.title}` : ""}
          </Link>
        ) : (
          <div className="text-sm text-[#fff8e6]/70">Add a show below to go on air from the Studio.</div>
        )}
        <div className="text-xs text-[#fff8e6]/60">
          The Studio is how you go on air.{" "}
          <button type="button" onClick={() => setObs(true)} className="cursor-pointer underline hover:text-[#fff8e6]">
            Broadcast from OBS instead
          </button>
        </div>
      </div>
      {obs && <ObsPanel onClose={() => setObs(false)} />}
    </div>
  );
}
