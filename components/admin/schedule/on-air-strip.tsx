"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Mic } from "lucide-react";
import { expandOccurrences } from "@/lib/schedule-core";
import type { Occurrence } from "@/lib/schedule-core";
import { hm as fmtTime } from "@/components/admin/ui";
import type { BroadcastRecord, ShowRecord } from "@/lib/schedule-client";

/** The Studio for one airing of a broadcast. */
export const studioHref = (o: Pick<Occurrence, "broadcastId" | "start">) => `/admin/schedule/studio?b=${encodeURIComponent(o.broadcastId)}&at=${o.start.getTime()}`;

/** A radio airing someone hosts live (not a playlist or a relayed stream): it's run from the Studio. */
export const hostedOnRadio = (o: Pick<Occurrence, "onRadio" | "plays">) => o.onRadio && o.plays === "hosted";

/** One line under the Schedule's page bar: what is on air (or next), and the way into the Studio. */
export function OnAirStrip({ shows, broadcasts }: { shows: ShowRecord[]; broadcasts: BroadcastRecord[] }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const upcoming: Occurrence[] = expandOccurrences(shows, broadcasts.filter((b) => b.onRadio), now, new Date(now.getTime() + 8 * 86400000), false);
  const current = upcoming.find((o) => o.start <= now && o.end > now) ?? null;
  const next = upcoming.find((o) => o.start > now) ?? null;
  // the show to open: the one on air, else the next one hosted live
  const target = current && hostedOnRadio(current) ? current : upcoming.find((o) => o.start > now && hostedOnRadio(o)) ?? null;
  const dayName = (d: Date) => (d.toDateString() === now.toDateString() ? "today" : d.toLocaleDateString(undefined, { weekday: "long" }));

  return (
    <div className="notice">
      <span className={current ? "dot red" : "dot grey"} />
      <span className="trunc" style={{ flex: 1 }}>
        {current ? (
          <>
            <b>On air: {current.title}</b>
            <span className="muted">
              {" "}
              until {fmtTime(current.end)}
              {next ? ` · next: ${next.title}, ${dayName(next.start)} ${fmtTime(next.start)}` : ""}
            </span>
          </>
        ) : next ? (
          <>
            <span className="muted">Nothing on air. Next: </span>
            <b>{next.title}</b>
            <span className="muted">
              , {dayName(next.start)} {fmtTime(next.start)}
            </span>
          </>
        ) : (
          <span className="muted">Nothing on air, and no radio shows coming up.</span>
        )}
      </span>
      {target && (
        <Link href={studioHref(target)} className="btn sm strong">
          <Mic className="ic-sm" />
          {target === current ? "Open Studio" : <span className="trunc" style={{ maxWidth: 220 }}>Studio: {target.title}</span>}
        </Link>
      )}
    </div>
  );
}
