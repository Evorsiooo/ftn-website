"use client";
import Link from "next/link";
import { useState } from "react";
import { M } from "./cards";
import * as I from "./icons";
import { UseStation } from "./shell";
import { ART } from "./station";

type Slot = { start: string; end: string; name: string; host?: string; art: string; radio: boolean; video: boolean; past?: boolean; cancelled?: boolean };
type Day = { id: string; chip: string; title: string; slots: Slot[]; now?: { after: number; time: string } };

// The mockup's clock: Saturday 21 November, 21:40. Ridgeway Review and The Wire are the real recurring shows.
const DAYS: Day[] = [
  {
    id: "today",
    chip: "Today",
    title: "Today",
    slots: [
      { start: "18:00", end: "20:00", name: "Saturday Warm-Up", art: ART.warmup, radio: true, video: false, past: true },
      { start: "22:00", end: "00:00", name: "Night Drive", art: ART.nightDrive, radio: true, video: false },
    ],
    now: { after: 1, time: "21:40" },
  },
  { id: "sun", chip: "Sun 22", title: "Sunday 22", slots: [{ start: "14:00", end: "16:00", name: "Sunday Drive", art: ART.sundayDrive, radio: true, video: false }] },
  { id: "wed", chip: "Wed 25", title: "Wednesday 25", slots: [{ start: "03:00", end: "05:00", name: "Ridgeway Review", host: "with Palmer Times", art: ART.ridgeway, radio: true, video: true }] },
  { id: "fri", chip: "Fri 27", title: "Friday 27", slots: [{ start: "03:00", end: "04:00", name: "The Wire: Harrison County", host: "with Kuzymah", art: ART.wire, radio: true, video: false, cancelled: true }] },
];

function SlotRow({ s }: { s: Slot }) {
  const inner = (
    <>
      <div className="time">
        {s.start} – {s.end}
      </div>
      <img src={s.art} alt="" />
      <div style={{ minWidth: 0 }}>
        <div className="n">
          <span>{s.name}</span>
          {s.cancelled && <span className="tag">Cancelled</span>}
        </div>
        {s.host && <div className="h">{s.host}</div>}
      </div>
      <div className="kinds">
        {s.radio && <I.Radio aria-label="On the radio" />}
        {s.video && <I.Video aria-label="On video" />}
      </div>
    </>
  );
  const cls = `slot${s.past ? " past" : ""}${s.cancelled ? " cancelled" : ""}`;
  return s.cancelled ? (
    <div className={cls}>{inner}</div>
  ) : (
    <Link href={`${M}/radio${s.name === "Night Drive" ? "/show" : ""}`} className={cls}>
      {inner}
    </Link>
  );
}

export function SchedulePage() {
  const [day, setDay] = useState("today");
  return (
    <main className="page" style={{ maxWidth: 1100 }}>
      <UseStation mode="autodj" />
      <h1 className="h1">Schedule</h1>
      <div className="days">
        {DAYS.map((d) => (
          <a
            key={d.id}
            href={`#${d.id}`}
            className="chip"
            style={{ paddingLeft: 16 }}
            aria-pressed={day === d.id}
            onClick={() => setDay(d.id)}
          >
            {d.chip}
          </a>
        ))}
      </div>
      {DAYS.map((d) => (
        <section key={d.id} id={d.id} className="day" style={{ scrollMarginTop: 96 }}>
          <h2 className="h2">{d.title}</h2>
          {d.slots.map((s, i) => (
            <div key={s.name}>
              <SlotRow s={s} />
              {d.now && i === d.now.after - 1 && (
                <div className="nowline" aria-label={`Now, ${d.now.time}`}>
                  <span>{d.now.time}</span>
                  <i />
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
      <p className="note">Between shows, the radio plays music around the clock.</p>
    </main>
  );
}

const MEDIA = "https://ftn.euno.cc/api/media/sports/2026/10/";
export const LEAGUES = [
  {
    slug: "harrison-grand-touring-championship",
    name: "Harrison Grand Touring Championship",
    sport: "Racing",
    season: "2026",
    logo: MEDIA + "bd672ffb-38ef-4742-812b-efc7b504ce6d.png",
    banner: MEDIA + "7368a092-3e5d-4bdf-8d47-4e78cdeba655.png",
  },
  {
    slug: "harrison-rallying-championship",
    name: "Harrison Rallying Championship",
    sport: "Rally",
    season: "2026",
    logo: MEDIA + "0444e08b-6544-4c2f-9a8a-3f75cbdad26a.png",
    banner: MEDIA + "e287661c-6c35-4ac0-9ed5-1d0788062dec.png",
  },
];
const VENUE = MEDIA + "258289b7-d1b6-4a22-991f-3cdc83b44dc1.png";
const TEAM_LOGO = MEDIA + "c90d56d4-06a4-40a5-9821-8b43d28221ca.png";

export function SportsPage() {
  const gt = LEAGUES[0];
  return (
    <main className="page">
      <UseStation mode="autodj" />
      <h1 className="h1" style={{ marginBottom: 24 }}>
        Sports
      </h1>
      <div className="leagues">
        {LEAGUES.map((l) => (
          <Link key={l.slug} href={`${M}/sports/${l.slug}`} className="league">
            <img src={l.banner} alt="" />
            <div className="copy">
              <img src={l.logo} alt="" />
              <div>
                <div className="n">{l.name}</div>
                <div className="s">
                  {l.sport} · {l.season}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <h2 className="h2" style={{ margin: "40px 0 16px" }}>
        Coming up
      </h2>
      <Link href={`${M}/sports/${gt.slug}`} className="upnext">
        <div className="time num" style={{ font: "600 15px/1.3 var(--body)" }}>
          Sat 28 Nov
          <br />
          <span className="muted">20:00</span>
        </div>
        <div>
          <div style={{ font: "700 18px/1.25 var(--body)" }}>Round 2</div>
          <div className="muted" style={{ fontSize: 14 }}>
            {gt.name}
          </div>
        </div>
      </Link>
    </main>
  );
}

export function LeaguePage({ slug }: { slug: string }) {
  const l = LEAGUES.find((x) => x.slug === slug) ?? LEAGUES[0];
  const gt = l.slug === LEAGUES[0].slug;
  const [tab, setTab] = useState<"races" | "standings" | "teams">("races");
  return (
    <main>
      <UseStation mode="autodj" />
      <section className="lbanner">
        <img src={l.banner} alt="" />
        <div className="copy">
          <img src={l.logo} alt="" />
          <div>
            <h1 className="h1">{l.name}</h1>
            <div className="muted" style={{ marginTop: 6 }}>
              {l.sport} · {l.season}
            </div>
          </div>
        </div>
      </section>
      <div style={{ padding: "0 var(--pad) 64px", maxWidth: 1100 }}>
        <div className="tabs" role="tablist">
          {(
            [
              ["races", "Races"],
              ["standings", "Standings"],
              ["teams", "Teams"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        {tab === "races" &&
          (gt ? (
            <>
              <div className="event">
                <div className="ph">
                  <img src={VENUE} alt="" />
                </div>
                <div>
                  <div className="n">Round 1: Jamestown GT Cup</div>
                  <div className="s">Sun 26 Jul · Final</div>
                </div>
                <span />
              </div>
              <div className="event">
                <div className="ph">No photo yet</div>
                <div>
                  <div className="n">Round 2</div>
                  <div className="s">Sat 28 Nov · 20:00</div>
                </div>
                <span />
              </div>
            </>
          ) : (
            <div className="empty">No races yet.</div>
          ))}
        {tab === "standings" && <div className="empty">No results yet.</div>}
        {tab === "teams" &&
          (gt ? (
            <div className="event" style={{ gridTemplateColumns: "56px minmax(0,1fr)" }}>
              <img src={TEAM_LOGO} alt="" style={{ width: 56, height: 56, objectFit: "contain" }} />
              <div>
                <div className="n">Chevalier Racing</div>
                <div className="s">CHV</div>
              </div>
            </div>
          ) : (
            <div className="empty">No teams yet.</div>
          ))}
      </div>
    </main>
  );
}
