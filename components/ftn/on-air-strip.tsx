"use client";
import React, { useEffect, useState } from "react";
import { IconHeadphones, IconPlayerPlay } from "@tabler/icons-react";
import { useSiteConfig } from "@/lib/site-config-context";
import { addDays } from "@/lib/schedule-client";
import { Button, GUTTER, LivePill, ProgressBar } from "./ui";
import { ArtTile } from "./media";
import { cn } from "@/lib/utils";

interface Entry {
  id: string;
  title: string;
  presenter: string | null;
  artUrl: string | null;
  onRadio: boolean;
  onStream: boolean;
  status: "scheduled" | "cancelled";
  youtubeId: string | null;
  start: string;
  end: string;
}

/** "On air now" across radio and streams. Renders nothing when nothing is live. */
export function OnAirStrip() {
  const { webradioEnabled } = useSiteConfig();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const d = new Date();
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    const to = addDays(from, 3);
    fetch(`/api/schedule?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((res) => res.json())
      .then((data: any) => setEntries(Array.isArray(data?.schedule) ? data.schedule : []))
      .catch(() => {});
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);

  const live = entries.filter(
    (e) => e.status !== "cancelled" && new Date(e.start).getTime() <= now && new Date(e.end).getTime() > now
  );
  if (live.length === 0) return null;

  return (
    <section className={cn("space-y-3.5", GUTTER)}>
      <h2 className="ftn-title text-xl sm:text-2xl flex items-center gap-3">
        On air now <LivePill>Live</LivePill>
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {live.map((e) => {
          const start = new Date(e.start).getTime();
          const end = new Date(e.end).getTime();
          const watch = e.onStream && e.youtubeId;
          return (
            <div key={e.id} className="flex items-center gap-4 rounded-2xl border border-ftn-line bg-ftn-surface p-3.5">
              <ArtTile src={e.artUrl} className="h-20 w-20 flex-shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="ftn-eyebrow text-ftn-text-3">{watch ? "Livestream" : "FTN Radio"}</div>
                <div className="ftn-title text-base truncate">{e.title}</div>
                {e.presenter && <div className="text-xs text-ftn-text-2 truncate">with {e.presenter}</div>}
                <ProgressBar value={Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))} />
              </div>
              {watch ? (
                <Button href={`/plus/watch/${e.youtubeId}`} size="sm">
                  <IconPlayerPlay className="h-3.5 w-3.5 fill-current" /> Watch
                </Button>
              ) : (
                e.onRadio &&
                webradioEnabled && (
                  <Button href="/plus/radio" size="sm">
                    <IconHeadphones className="h-3.5 w-3.5" /> Listen
                  </Button>
                )
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
