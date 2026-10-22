"use client";
import { useEffect, useState } from "react";
import { addDays } from "@/lib/schedule-client";

export interface ScheduleEntry {
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

/** Schedule entries from yesterday to two days ahead, plus a clock that ticks every 30s. */
export function useSchedule() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const d = new Date();
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
    const to = addDays(from, 3);
    fetch(`/api/schedule?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((res) => res.json())
      .then((data: any) => setEntries(Array.isArray(data?.schedule) ? data.schedule : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);

  const active = entries.filter((e) => e.status !== "cancelled");
  const live = active.filter((e) => new Date(e.start).getTime() <= now && new Date(e.end).getTime() > now);
  const upcoming = active
    .filter((e) => new Date(e.start).getTime() > now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return { entries, live, upcoming, loaded, now };
}
