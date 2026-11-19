"use client";
import React from "react";
import Link from "next/link";
import { RO_STATES } from "@/lib/ro-states";
import { formatWhen, hm } from "@/components/admin/ui";
import { Chart, Kpi, Legend, RankList, byDay, dayLabel, dayList, dayTip, fmtNum } from "./charts";

/* The four Stats tabs. Each gets one API answer (see lib/stats/queries.ts) and only draws it. */

const hours = (h: number) => (h >= 10 ? Math.round(h).toLocaleString() : fmtNum(Math.round(h * 10) / 10));
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
const duration = (sec: number | null) => {
  if (sec == null) return "–";
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} min`;
  if (sec < 86_400) return `${fmtNum(Math.round((sec / 3600) * 10) / 10)} h`;
  return `${fmtNum(Math.round((sec / 86_400) * 10) / 10)} days`;
};
/** Per-day charts need a week or more; on "24 h" they say so instead of showing one lonely bar. */
const short = (days: number) => (days < 7 ? "Per day from 7 days up" : undefined);
const stateLabel = (k: string) => RO_STATES.find((s) => s.key === k)?.label ?? k;

function DayChart({ days, rows, pick, name, unit, height }: { days: number; rows: { day: string }[]; pick: (r: any) => number; name: string; unit?: string; height?: number }) {
  const list = dayList(Math.max(days, 7));
  return <Chart labels={list.map(dayLabel)} tips={list.map(dayTip)} hide={short(days)} series={[{ name, kind: "bar", values: byDay(list, rows, pick) }]} unit={unit} height={height} />;
}

// ---------------------------------------------------------------- Radio

export function RadioTab({ data, days }: { data: any; days: number }) {
  const r = data.radio;
  // one point per bucket, from the start of the range to now (gaps stay empty)
  const step = r.bucketSec * 1000;
  const now = Date.now();
  const first = Math.floor((now - days * 86_400_000) / step) * step + step;
  const pts: number[] = [];
  for (let t = first; t <= now; t += step) pts.push(t);
  const byT = new Map<number, { avg: number; peak: number }>(r.listeners.map((p: any) => [p.t, p]));
  const lbl = (t: number) => (days <= 1 ? hm(t) : days <= 7 ? new Date(t).toLocaleDateString(undefined, { weekday: "short" }) + " " + hm(t).slice(0, 2) + "h" : dayLabel(new Date(t).toISOString().slice(0, 10)));
  const tip = (t: number) => (r.bucketSec >= 86_400 ? dayTip(new Date(t).toISOString().slice(0, 10)) : formatWhen(t));
  const daysList = dayList(Math.max(days, 7));
  const imports = Object.fromEntries((r.imports as any[]).map((i) => [i.state, i]));
  const failedSongs = (r.imports as any[]).reduce((a, i) => a + (i.songsFailed || 0), 0);
  const rtcGb = r.rtc.bytes / 1e9;

  return (
    <div className="stats">
      <div className="kpis">
        <Kpi label="Peak listeners" value={fmtNum(r.peak)} sub={r.peakAt ? formatWhen(r.peakAt) : "No data yet"} />
        <Kpi label="Average listeners" value={fmtNum(r.average)} sub="at any moment" />
        <Kpi label="Unique listeners" value={fmtNum(r.unique)} sub={days <= 1 ? "today" : `over ${days} days`} />
        <Kpi label="Hours listened" value={hours(r.hours)} sub="all listeners together" />
        <Kpi label="Songs played" value={fmtNum(r.plays)} sub={`${fmtNum(r.library.active)} songs in the library`} />
      </div>

      <section>
        <h2>
          Listeners <span className="c">{r.bucketSec === 300 ? "every 5 minutes" : r.bucketSec === 3600 ? "per hour" : r.bucketSec === 86_400 ? "per day" : "per 3 hours"}</span>
        </h2>
        <div className="panel">
          {r.bucketSec > 300 && (
            <Legend
              items={[
                { name: "Peak", color: "s1", kind: "line" },
                { name: "Average", color: "s2", kind: "line" },
              ]}
            />
          )}
          <Chart
            height={220}
            labels={pts.map(lbl)}
            tips={pts.map(tip)}
            series={
              r.bucketSec > 300
                ? [
                    { name: "Peak", color: "s1", kind: "area", values: pts.map((t) => byT.get(t)?.peak ?? null) },
                    { name: "Average", color: "s2", kind: "line", values: pts.map((t) => byT.get(t)?.avg ?? null) },
                  ]
                : [{ name: "Listeners", kind: "area", values: pts.map((t) => byT.get(t)?.peak ?? null) }]
            }
            empty="Listener counts start being saved once this is live (every 5 minutes)."
          />
        </div>
      </section>

      <div className="grid2">
        <div className="panel">
          <h3>Unique listeners per day</h3>
          <DayChart days={days} rows={r.uniqueDays} pick={(x) => x.n} name="Listeners" />
        </div>
        <div className="panel">
          <h3>Hours listened per day</h3>
          <DayChart days={days} rows={r.hoursDays} pick={(x) => x.hours} name="Hours" unit=" h" />
        </div>
      </div>

      <section>
        <h2>Songs</h2>
        <div className="grid3">
          <div className="panel">
            <h3>
              Most played <span className="c">plays</span>
            </h3>
            <RankList rows={r.topSongs.map((s: any) => ({ key: s.key, label: s.title, sub: s.artist, value: s.plays }))} empty="No plays logged yet" />
          </div>
          <div className="panel">
            <h3>
              Top artists <span className="c">plays</span>
            </h3>
            <RankList rows={r.topArtists.map((s: any) => ({ key: s.artist, label: s.artist, sub: `${s.songs} ${s.songs === 1 ? "song" : "songs"}`, value: s.plays }))} empty="No plays logged yet" />
          </div>
          <div className="panel">
            <h3>
              Just played <span className="c">listeners</span>
            </h3>
            {r.recent.length === 0 ? (
              <div className="rank-empty">No plays logged yet</div>
            ) : (
              <ol className="rank">
                {r.recent.map((p: any) => (
                  <li key={p.at}>
                    <div className="lbl-row">
                      <span className="muted num" style={{ width: 42, flex: "none" }}>
                        {hm(p.at)}
                      </span>
                      <span className="grow trunc">
                        {p.title} <span className="muted">· {p.artist}</span>
                      </span>
                      <b className="num">{p.listeners ?? "–"}</b>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2>
          Votes <Link href="/admin/radio/library?tab=ratings">All ratings</Link>
        </h2>
        <div className="grid3">
          <div className="panel">
            <h3>Votes per day</h3>
            <Legend
              items={[
                { name: "Up", color: "s1" },
                { name: "Down", color: "s2" },
              ]}
            />
            {(() => {
              const list = dayList(Math.max(days, 7));
              return (
                <Chart
                  labels={list.map(dayLabel)}
                  tips={list.map(dayTip)} hide={short(days)}
                  series={[
                    { name: "Up", color: "s1", kind: "bar", values: byDay(list, r.voteDays, (x: any) => x.up) },
                    { name: "Down", color: "s2", kind: "bar", values: byDay(list, r.voteDays, (x: any) => x.down) },
                  ]}
                />
              );
            })()}
          </div>
          <div className="panel">
            <h3>
              Best rated <span className="c">score</span>
            </h3>
            <RankList rows={r.best.map((s: any) => ({ key: s.key, label: s.title, sub: s.artist, value: s.score }))} empty="Not enough votes yet" />
          </div>
          <div className="panel">
            <h3>
              Worst rated <span className="c">score</span>
            </h3>
            {r.worst.length === 0 ? (
              <div className="rank-empty">No song with a negative score</div>
            ) : (
              <ol className="rank">
                {r.worst.map((s: any) => (
                  <li key={s.key}>
                    <div className="lbl-row">
                      <span className="grow trunc">
                        {s.title} <span className="muted">· {s.artist}</span>
                      </span>
                      <b className="num">{s.score}</b>
                      <span className="t12 muted">{s.votes} votes</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2>
          Shows <span className="c">Studio shows and automated shows</span>
        </h2>
        {r.shows.length === 0 ? (
          <div className="panel rank-empty">No shows in this period</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Show</th>
                  <th className="hide-s" style={{ width: 150 }}>
                    When
                  </th>
                  <th className="r hide-s">Length</th>
                  <th className="r">Peak</th>
                  <th className="r hide-s">Average</th>
                  <th className="r">Callers</th>
                </tr>
              </thead>
              <tbody>
                {r.shows.map((s: any) => (
                  <tr key={s.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{s.title}</span>
                      <span className="t12 muted"> · {s.kind === "studio" ? "Studio" : "Automated"}</span>
                    </td>
                    <td className="hide-s">{formatWhen(s.startedAt)}</td>
                    <td className="r hide-s num">{s.endedAt ? duration((Math.min(s.endedAt, Date.now()) - s.startedAt) / 1000) : "live"}</td>
                    <td className="r num">{s.peak ?? "–"}</td>
                    <td className="r hide-s num">{s.avg == null ? "–" : fmtNum(Math.round(s.avg * 10) / 10)}</td>
                    <td className="r num">{s.kind === "studio" ? s.callers : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>
          Library <Link href="/admin/radio/library">Song library</Link>
        </h2>
        <div className="grid3">
          <div className="panel">
            <h3>
              Songs added per day <span className="c">{fmtNum(r.added.reduce((a: number, x: any) => a + x.n, 0))} in total</span>
            </h3>
            <Chart labels={daysList.map(dayLabel)} tips={daysList.map(dayTip)} hide={short(days)} series={[{ name: "Songs", kind: "bar", values: byDay(daysList, r.added, (x: any) => x.n) }]} height={150} />
          </div>
          <div className="panel">
            <h3>Imports</h3>
            <div className="kpis" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", marginBottom: 10 }}>
              <Kpi label="Finished" value={fmtNum(imports.done?.n ?? 0)} sub={`${fmtNum((r.imports as any[]).reduce((a, i) => a + (i.songsDone || 0), 0))} songs`} />
              <Kpi label="Failed" value={fmtNum(imports.failed?.n ?? 0)} sub={`${fmtNum(failedSongs)} songs failed`} />
            </div>
            {r.failedImports.map((i: any) => (
              <div key={i.id} className="t12 trunc" title={i.error || ""}>
                <span style={{ fontWeight: 600 }}>{i.title || i.url}</span> <span className="muted">· {i.error || "some songs failed"}</span>
              </div>
            ))}
          </div>
          <div className="panel">
            <h3>Library and voice</h3>
            <div className="kpis" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", marginBottom: 10 }}>
              <Kpi label="Songs" value={fmtNum(r.library.active)} sub={`${hours(r.library.seconds / 3600)} h of music`} />
              <Kpi label="Voice this month" value={`${fmtNum(Math.round(rtcGb * 10) / 10)} GB`} sub={`of ${fmtNum(r.rtc.capBytes / 1e9)} GB cap`} />
            </div>
            <div className="meter" aria-label="Voice data used this month">
              <i style={{ width: `${Math.min(100, (r.rtc.bytes / r.rtc.capBytes) * 100)}%` }} />
            </div>
          </div>
        </div>
      </section>
      <p className="note">Listener counts are saved every 5 minutes from the players that are on. Days are in UTC.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Website

export function SiteTab({ data, days }: { data: any; days: number }) {
  const s = data.site;
  const web = data.web;
  const list = dayList(Math.max(days, 7));
  const w = web?.ok ? web.stats : null;
  const totalViews = w ? w.days.reduce((a: number, d: any) => a + d.views, 0) : 0;
  const totalVisits = w ? w.days.reduce((a: number, d: any) => a + d.visits, 0) : 0;
  const deviceTotal = w ? w.devices.reduce((a: number, d: any) => a + d.visits, 0) : 0;
  const slugOf = (p: string) => decodeURIComponent(p.replace(/^\/articles\//, "").replace(/\/$/, ""));

  return (
    <div className="stats">
      {!w && (
        <div className="setup">
          {web?.reason === "not_configured" ? (
            <>
              <b>Visitor numbers aren&apos;t connected yet.</b>
              <ol>
                <li>Cloudflare: Workers &amp; Pages › ftn-news › Metrics › Web Analytics › Enable.</li>
                <li>Create an API token with Account › Account Analytics › Read.</li>
                <li>Add it to ftn-news › Settings › Variables and Secrets as CF_ANALYTICS_TOKEN.</li>
              </ol>
            </>
          ) : (
            <span>
              <b>Couldn&apos;t read visitor numbers from Cloudflare.</b> {web?.message}
            </span>
          )}
        </div>
      )}
      <div className="kpis">
        <Kpi label="Visits" value={w ? fmtNum(totalVisits) : "–"} sub="Cloudflare Web Analytics" />
        <Kpi label="Page views" value={w ? fmtNum(totalViews) : "–"} sub={w && totalVisits ? `${fmtNum(Math.round((totalViews / totalVisits) * 10) / 10)} per visit` : " "} />
        <Kpi label="Articles published" value={fmtNum(s.published.reduce((a: number, x: any) => a + x.n, 0))} sub={`${fmtNum(s.publishedAll)} in total`} />
        <Kpi label="Comments" value={fmtNum(s.comments)} />
        <Kpi label="Sign-ups" value={fmtNum(s.signups.reduce((a: number, x: any) => a + x.n, 0))} sub={`${fmtNum(s.usersAll)} accounts`} />
      </div>

      <section>
        <h2>Visitors</h2>
        <div className="panel">
          <Legend
            items={[
              { name: "Page views", color: "s1", kind: "line" },
              { name: "Visits", color: "s2", kind: "line" },
            ]}
          />
          <Chart
            height={220}
            labels={list.map(dayLabel)}
            tips={list.map(dayTip)} hide={short(days)}
            series={[
              { name: "Page views", color: "s1", kind: "area", values: w ? byDay(list, w.days, (x: any) => x.views) : list.map(() => null) },
              { name: "Visits", color: "s2", kind: "line", values: w ? byDay(list, w.days, (x: any) => x.visits) : list.map(() => null) },
            ]}
            empty={w ? "No visits in this period" : "Waiting for Cloudflare Web Analytics"}
          />
        </div>
      </section>

      <div className="grid3">
        <div className="panel">
          <h3>
            Top pages <span className="c">views</span>
          </h3>
          <RankList rows={(w?.pages ?? []).map((p: any) => ({ key: p.path, label: p.path, value: p.views }))} empty={w ? "No page views yet" : "Not connected"} />
        </div>
        <div className="panel">
          <h3>
            Where visitors come from <span className="c">visits</span>
          </h3>
          <RankList rows={(w?.referrers ?? []).map((p: any) => ({ key: p.host || "direct", label: p.host || "Direct or app", value: p.visits }))} empty={w ? "No visits yet" : "Not connected"} />
        </div>
        <div className="panel">
          <h3>
            Countries <span className="c">visits</span>
          </h3>
          <RankList rows={(w?.countries ?? []).map((p: any) => ({ key: p.name, label: p.name, value: p.visits }))} empty={w ? "No visits yet" : "Not connected"} />
          {w && deviceTotal > 0 && (
            <p className="note" style={{ marginTop: 12 }}>
              {w.devices.map((d: any) => `${d.name === "desktop" ? "Computer" : d.name === "mobile" ? "Phone" : d.name === "tablet" ? "Tablet" : d.name} ${pct(d.visits, deviceTotal)}`).join(" · ")}
            </p>
          )}
        </div>
      </div>

      <section>
        <h2>Articles</h2>
        <div className="grid2">
          <div className="panel">
            <h3>
              Most read <span className="c">views</span>
            </h3>
            <RankList
              rows={(w?.articles ?? [])
                .filter((a: any) => slugOf(a.path))
                .slice(0, 10)
                .map((a: any) => ({ key: a.path, label: s.titles[slugOf(a.path)] ?? slugOf(a.path), value: a.views }))}
              empty={w ? "No article views yet" : "Needs Cloudflare Web Analytics"}
            />
          </div>
          <div className="panel">
            <h3>
              Most commented <span className="c">comments</span>
            </h3>
            <RankList rows={s.commented.map((a: any) => ({ key: a.slug, label: a.title, value: a.comments }))} empty="No comments in this period" />
          </div>
          <div className="panel">
            <h3>Articles published per day</h3>
            <DayChart days={days} rows={s.published} pick={(x) => x.n} name="Articles" height={150} />
          </div>
          <div className="panel">
            <h3>
              Tips received per day <span className="c">{fmtNum(s.tips.reduce((a: number, x: any) => a + x.n, 0))} in total</span>
            </h3>
            <DayChart days={days} rows={s.tips} pick={(x) => x.n} name="Tips" height={150} />
          </div>
        </div>
      </section>

      <section>
        <h2>Sign-ups per day</h2>
        <div className="panel">
          <DayChart days={days} rows={s.signups} pick={(x) => x.n} name="Sign-ups" height={150} />
        </div>
      </section>
      <p className="note">Visitors are counted by Cloudflare Web Analytics, without cookies. Days are in UTC.</p>
    </div>
  );
}

// ---------------------------------------------------------------- FTN+

export function PlusTab({ data, days }: { data: any; days: number }) {
  const p = data.plus;
  const list = dayList(Math.max(days, 7));
  const radioHours = p.radioDays.reduce((a: number, x: any) => a + x.hours, 0);
  return (
    <div className="stats">
      <div className="kpis">
        <Kpi label="Video views" value={fmtNum(p.views)} />
        <Kpi label="Hours watched" value={hours(p.watch.hours)} sub={`${fmtNum(p.watch.sessions)} viewings measured`} />
        <Kpi label="Watched to the end" value={pct(p.watch.q100, p.watch.sessions)} sub={`${pct(p.watch.q50, p.watch.sessions)} got halfway`} />
        <Kpi label="Radio hours" value={hours(radioHours)} sub="for comparison" />
      </div>

      <section>
        <h2>Video views per day</h2>
        <div className="panel">
          <Chart height={200} labels={list.map(dayLabel)} tips={list.map(dayTip)} hide={short(days)} series={[{ name: "Views", kind: "bar", values: byDay(list, p.viewDays, (x: any) => x.n) }]} />
        </div>
      </section>

      <section>
        <h2>
          Radio and videos <span className="c">hours per day</span>
        </h2>
        <div className="panel">
          <Legend
            items={[
              { name: "Radio", color: "s1", kind: "line" },
              { name: "Videos", color: "s2", kind: "line" },
            ]}
          />
          <Chart
            height={200}
            unit=" h"
            labels={list.map(dayLabel)}
            tips={list.map(dayTip)} hide={short(days)}
            series={[
              { name: "Radio", color: "s1", kind: "line", values: byDay(list, p.radioDays, (x: any) => Math.round(x.hours * 10) / 10) },
              { name: "Videos", color: "s2", kind: "line", values: byDay(list, p.watchDays, (x: any) => Math.round(x.hours * 10) / 10) },
            ]}
          />
        </div>
      </section>

      <div className="grid2">
        <div className="panel">
          <h3>
            Most viewed <span className="c">views</span>
          </h3>
          <RankList rows={p.topVideos.map((v: any) => ({ key: v.youtubeId, label: v.title, sub: v.channel, value: v.views }))} empty="No views in this period" />
        </div>
        <div className="panel">
          <h3>
            Most watched <span className="c">hours</span>
          </h3>
          <RankList
            rows={p.topWatched.map((v: any) => ({ key: v.youtubeId, label: v.title || v.youtubeId, sub: `${pct(v.q100, v.sessions)} to the end`, value: Math.round(v.hours * 10) / 10 }))}
            unit=" h"
            empty="Watch time is measured from now on"
          />
        </div>
      </div>

      <section>
        <h2>How far people get</h2>
        <div className="panel">
          <RankList
            rows={[
              { key: "q25", label: "A quarter of the video", value: p.watch.q25 },
              { key: "q50", label: "Halfway", value: p.watch.q50 },
              { key: "q75", label: "Three quarters", value: p.watch.q75 },
              { key: "q100", label: "The end", value: p.watch.q100 },
            ].map((r) => ({ ...r, extra: <span className="t12 muted" style={{ width: 40, textAlign: "right" }}>{pct(r.value, p.watch.sessions)}</span> }))}
            empty="Watch time is measured from now on"
          />
        </div>
      </section>
      <p className="note">Views count each time a video page opens. Watch time counts only the seconds a video really played. Days are in UTC.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Posts and ads

export function PostsTab({ data, days, onReport }: { data: any; days: number; onReport: (orgId: string) => void }) {
  const p = data.posts;
  const list = dayList(Math.max(days, 7));
  const sent = (p.statuses.approved ?? 0) + (p.statuses.denied ?? 0) + (p.statuses.pending ?? 0);
  const ads = p.ads;
  return (
    <div className="stats">
      <div className="kpis">
        <Kpi label="Posts sent" value={fmtNum(sent)} sub={`${fmtNum(p.statuses.pending ?? 0)} waiting`} />
        <Kpi label="Approved" value={pct(p.statuses.approved ?? 0, (p.statuses.approved ?? 0) + (p.statuses.denied ?? 0))} sub={`${fmtNum(p.statuses.approved ?? 0)} approved, ${fmtNum(p.statuses.denied ?? 0)} denied`} />
        <Kpi label="Time to a decision" value={duration(p.medianWaitSec)} sub={p.decided ? `median of ${p.decided}` : "No decisions yet"} />
        {ads && <Kpi label="Ad views on the site" value={fmtNum(ads.days.reduce((a: number, x: any) => a + x.views, 0))} sub={`${fmtNum(ads.days.reduce((a: number, x: any) => a + x.clicks, 0))} clicks`} />}
      </div>

      <section>
        <h2>Posts per day</h2>
        <div className="panel">
          <Chart height={180} labels={list.map(dayLabel)} tips={list.map(dayTip)} hide={short(days)} series={[{ name: "Posts", kind: "bar", values: byDay(list, p.days, (x: any) => x.n) }]} />
        </div>
      </section>

      <div className="grid2">
        <div className="panel">
          <h3>
            By Ro-State <span className="c">posts</span>
          </h3>
          <RankList rows={p.states.map((s: any) => ({ key: s.state, label: stateLabel(s.state), sub: `${s.approved} approved`, value: s.n }))} empty="No posts in this period" />
        </div>
        <div className="panel">
          <h3>
            By staff member <span className="c">posts</span>
          </h3>
          <RankList
            rows={p.people.map((u: any) => ({ key: u.username, label: u.name || u.username, sub: `${u.approved} approved${u.denied ? `, ${u.denied} denied` : ""}`, value: u.n }))}
            empty="No posts in this period"
          />
        </div>
      </div>

      {ads && (
        <section>
          <h2>
            Ads <Link href="/admin/ads">Ads</Link>
          </h2>
          <div className="grid2" style={{ marginBottom: 12 }}>
            <div className="panel">
              <h3>Ad views on the site per day</h3>
              <Chart labels={list.map(dayLabel)} tips={list.map(dayTip)} hide={short(days)} series={[{ name: "Views", kind: "bar", values: byDay(list, ads.days, (x: any) => x.views) }]} height={160} />
            </div>
            <div className="panel">
              <h3>Ad clicks per day</h3>
              <Chart labels={list.map(dayLabel)} tips={list.map(dayTip)} hide={short(days)} series={[{ name: "Clicks", kind: "bar", values: byDay(list, ads.days, (x: any) => x.clicks) }]} height={160} />
            </div>
          </div>
          {ads.organizers.length === 0 ? (
            <div className="panel rank-empty">No advertisers yet</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Advertiser</th>
                    <th className="r">Posts</th>
                    <th className="r hide-s">Post impressions</th>
                    <th className="r">Views</th>
                    <th className="r hide-s">Clicks</th>
                    <th className="r" style={{ width: 96 }} />
                  </tr>
                </thead>
                <tbody>
                  {ads.organizers.map((o: any) => (
                    <tr key={o.id}>
                      <td>
                        <span style={{ fontWeight: 600 }}>{o.name}</span>
                        <span className="t12 muted hide-s">
                          {" "}
                          · {o.ads} {o.ads === 1 ? "ad" : "ads"}
                        </span>
                      </td>
                      <td className="r num">{fmtNum(o.posts)}</td>
                      <td className="r hide-s num">
                        {fmtNum(o.postsUsed ?? 0)}
                        {o.unlimited ? "" : ` / ${fmtNum(o.postsBought ?? 0)}`}
                      </td>
                      <td className="r num">{fmtNum(o.views)}</td>
                      <td className="r hide-s num">{fmtNum(o.clicks)}</td>
                      <td className="r">
                        <button type="button" className="btn sm" onClick={() => onReport(o.id)}>
                          Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="note" style={{ marginTop: 8 }}>
            Views and clicks per day are counted from now on; the Ads page keeps the all-time totals. Post impressions are all-time (used / bought).
          </p>
        </section>
      )}
    </div>
  );
}
