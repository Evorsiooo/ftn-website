"use client";
import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { RO_STATES } from "@/lib/ro-states";
import { Body, PageBar, Pill, Screen, Seg, formatDay, formatWhen } from "@/components/admin/ui";
import { Chart, Kpi, byDay, dayLabel, dayList, dayTip, fmtNum } from "@/components/admin/stats/charts";

const GUILD_ID = "1152594197711437936";
const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];
const stateLabel = (k: string) => RO_STATES.find((s) => s.key === k)?.label ?? k;

/** An advertiser's report: what their ads got, ready to print or save as PDF and send them. */
function Report() {
  const router = useRouter();
  const params = useSearchParams();
  const org = params.get("org") || "";
  const days = RANGES.some((r) => r.value === params.get("days")) ? params.get("days")! : "30";
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    fetch(`/api/admin/stats/report?org=${encodeURIComponent(org)}&days=${days}`, { cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as any;
        if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
        return d;
      })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [org, days]);

  const n = Number(days);
  const list = dayList(n);
  const views = data ? data.ads.reduce((a: number, x: any) => a + x.views, 0) : 0;
  const clicks = data ? data.ads.reduce((a: number, x: any) => a + x.clicks, 0) : 0;
  const approved = data ? data.posts.filter((p: any) => p.status === "approved") : [];
  const from = new Date(Date.now() - n * 86_400_000);

  return (
    <Screen>
      <PageBar
        crumb={{ href: "/admin/stats?tab=posts", label: "Stats" }}
        title={data ? `${data.organizer.name} report` : "Advertiser report"}
        tools={<Seg value={days} onChange={(d) => router.replace(`/admin/stats/report?org=${encodeURIComponent(org)}&days=${d}`)} options={RANGES} label="Period" />}
        end={
          <button type="button" className="btn" onClick={() => window.print()} disabled={!data}>
            <Printer className="ic" />
            <span className="hide-m">Print or save PDF</span>
          </button>
        }
        mrow={<Seg value={days} onChange={(d) => router.replace(`/admin/stats/report?org=${encodeURIComponent(org)}&days=${d}`)} options={RANGES} label="Period" />}
      />
      <Body scroll>
        {error ? (
          <div className="pane-empty">{error}</div>
        ) : !data ? (
          <div className="pane-empty">Loading…</div>
        ) : (
          <div className="stats" style={{ maxWidth: 900 }}>
            <header style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {data.organizer.logo ? <img src={data.organizer.logo} alt="" className="thumb" style={{ width: 56, height: 56, objectFit: "contain", background: "transparent" }} /> : null}
              <div style={{ minWidth: 0 }}>
                <div className="t24" style={{ fontWeight: 650 }}>
                  {data.organizer.name}
                </div>
                <div className="muted">
                  Advertising report from FTN · {formatDay(from)} to {formatDay(new Date())}
                </div>
              </div>
            </header>

            <div className="kpis">
              <Kpi label="Posts with your ad" value={fmtNum(data.posts.length)} sub={`${fmtNum(approved.length)} published`} />
              <Kpi label="Ad views on ftn.euno.cc" value={fmtNum(views)} />
              <Kpi label="Clicks" value={fmtNum(clicks)} sub={views ? `${((clicks / views) * 100).toFixed(1)}% of views` : " "} />
              <Kpi label="Ads" value={fmtNum(data.ads.length)} sub={`${fmtNum(data.ads.filter((a: any) => a.status === "active").length)} running`} />
            </div>

            <section>
              <h2>Ad views per day</h2>
              <div className="panel">
                <Chart height={180} labels={list.map(dayLabel)} tips={list.map(dayTip)} series={[{ name: "Views", kind: "bar", values: byDay(list, data.days, (x: any) => x.views) }]} empty="No views in this period" />
              </div>
            </section>

            <section>
              <h2>Your ads</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ad</th>
                      <th className="r hide-s" style={{ width: 120 }}>
                        Post impressions
                      </th>
                      <th className="r">Views</th>
                      <th className="r">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ads.map((a: any) => (
                      <tr key={a.id}>
                        <td>
                          <span style={{ fontWeight: 600 }}>{a.name}</span>
                          <span className="t12 muted hide-s">
                            {" "}
                            · {formatDay(a.startDate * 1000)} to {formatDay(a.endDate * 1000)}
                          </span>
                        </td>
                        <td className="r hide-s num">
                          {fmtNum(a.postsUsed)}
                          {a.postsBought != null ? ` / ${fmtNum(a.postsBought)}` : ""}
                        </td>
                        <td className="r num">{fmtNum(a.views)}</td>
                        <td className="r num">{fmtNum(a.clicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2>
                Posts <span className="c">in this period</span>
              </h2>
              {data.posts.length === 0 ? (
                <div className="panel rank-empty">No posts with these ads in this period</div>
              ) : (
                <div className="rows">
                  {data.posts.map((p: any) => {
                    const link = p.channel && p.message ? `https://discord.com/channels/${GUILD_ID}/${p.channel}/${p.message}` : null;
                    return (
                      <div key={p.id} className="r">
                        <img src={p.image} alt="" className="thumb" style={{ width: 40, height: 40 }} />
                        <span className="grow">
                          <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                            {p.headline}
                          </span>
                          <span className="t12 muted">
                            {stateLabel(p.state)} · {formatWhen((p.decidedAt ?? p.createdAt) * 1000)}
                          </span>
                        </span>
                        {p.status === "approved" ? (
                          link ? (
                            <a className="link t12" href={link} target="_blank" rel="noreferrer">
                              Discord
                            </a>
                          ) : (
                            <Pill tone="green">Published</Pill>
                          )
                        ) : (
                          <Pill tone={p.status === "denied" ? "red" : "amber"}>{p.status === "denied" ? "Denied" : "Waiting"}</Pill>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <p className="note">Views count each time an ad is shown on ftn.euno.cc. Posts carry the ad into the Ro-State Discord feeds. Days are in UTC.</p>
          </div>
        )}
      </Body>
    </Screen>
  );
}

export default function AdvertiserReportPage() {
  return (
    <React.Suspense fallback={null}>
      <Report />
    </React.Suspense>
  );
}
