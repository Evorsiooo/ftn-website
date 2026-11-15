"use client";
export const runtime = "edge";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addDays, youtubeThumb } from "@/lib/schedule-client";
import { watchPath } from "@/lib/plus-links";
import * as I from "@/components/plus/icons";

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

const DAYS_SHOWN = 14;
const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const chipDay = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });
const longDay = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric" });

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function href(e: Entry) {
  if (e.onStream && e.youtubeId) return watchPath(e.youtubeId);
  if (e.onRadio) return "/plus/radio";
  return null;
}

function Slot({ e, now }: { e: Entry; now: number }) {
  const past = new Date(e.end).getTime() <= now;
  const cancelled = e.status === "cancelled";
  const art = e.artUrl || (e.youtubeId ? youtubeThumb(e.youtubeId) : null);
  const inner = (
    <>
      <div className="time">
        {time.format(new Date(e.start))} – {time.format(new Date(e.end))}
      </div>
      {art ? <img src={art} alt="" /> : <span className="ph-art" aria-hidden />}
      <div style={{ minWidth: 0 }}>
        <div className="n">
          <span>{e.title}</span>
          {cancelled && <span className="tag">Cancelled</span>}
        </div>
        {e.presenter && <div className="h">with {e.presenter}</div>}
      </div>
      <div className="kinds">
        {e.onRadio && <I.Radio aria-label="On the radio" />}
        {e.onStream && <I.Video aria-label="On video" />}
      </div>
    </>
  );
  const cls = `slot${past ? " past" : ""}${cancelled ? " cancelled" : ""}`;
  const to = href(e);
  return cancelled || !to ? <div className={cls}>{inner}</div> : <Link href={to} className={cls}>{inner}</Link>;
}

/** What's on, day by day, on the radio and on video, with a line at the current time. */
export default function SchedulePage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    const from = startOfDay(new Date());
    fetch(`/api/schedule?from=${from.toISOString()}&to=${addDays(from, DAYS_SHOWN).toISOString()}`)
      .then((r) => r.json())
      .then((d: any) => setEntries(Array.isArray(d?.schedule) ? d.schedule : []))
      .catch(() => setEntries([]));
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // today always, then each day that has something on
  const days = useMemo(() => {
    const today = startOfDay(new Date(now)).getTime();
    const groups = new Map<number, Entry[]>([[today, []]]);
    for (const e of [...(entries ?? [])].sort((a, b) => a.start.localeCompare(b.start))) {
      const k = startOfDay(new Date(e.start)).getTime();
      if (k < today) continue;
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    return [...groups.entries()].map(([k, list]) => {
      const d = new Date(k);
      const isToday = k === today;
      const isTomorrow = k === addDays(new Date(today), 1).getTime();
      return {
        id: `d${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
        chip: isToday ? "Today" : isTomorrow ? "Tomorrow" : chipDay.format(d),
        title: isToday ? "Today" : isTomorrow ? "Tomorrow" : longDay.format(d),
        isToday,
        list,
      };
    });
  }, [entries, now]);

  return (
    <main className="page" style={{ maxWidth: 1100 }}>
      <h1 className="h1">Schedule</h1>
      {entries === null ? (
        <div className="ph-box" style={{ height: 240, marginTop: 32 }} aria-label="Loading" />
      ) : (
        <>
          <div className="days">
            {days.map((d) => (
              <a key={d.id} href={`#${d.id}`} className="chip" style={{ paddingLeft: 16 }} aria-current={(day ?? days[0]?.id) === d.id ? "true" : undefined} onClick={() => setDay(d.id)}>
                {d.chip}
              </a>
            ))}
          </div>
          {days.map((d) => {
            // the now line goes after the last slot that has started
            const nowAfter = d.isToday ? d.list.filter((e) => new Date(e.start).getTime() <= now).length : -1;
            return (
              <section key={d.id} id={d.id} className="day" style={{ scrollMarginTop: 96 }}>
                <h2 className="h2">{d.title}</h2>
                {d.isToday && nowAfter === 0 && <NowLine now={now} />}
                {d.list.map((e, i) => (
                  <div key={e.id + e.start}>
                    <Slot e={e} now={now} />
                    {d.isToday && i === nowAfter - 1 && <NowLine now={now} />}
                  </div>
                ))}
                {d.list.length === 0 && <div className="muted" style={{ padding: "8px 16px" }}>No shows today.</div>}
              </section>
            );
          })}
          <p className="note">Between shows, the radio plays music around the clock.</p>
        </>
      )}
    </main>
  );
}

function NowLine({ now }: { now: number }) {
  const t = time.format(new Date(now));
  return (
    <div className="nowline" aria-label={`Now, ${t}`}>
      <span>{t}</span>
      <i />
    </div>
  );
}
