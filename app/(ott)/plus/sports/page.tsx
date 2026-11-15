"use client";
export const runtime = "edge";
// Sports: the leagues as banner cards, then what's coming up (the approved mockup, on the real sports data).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { broadcastLabel, fmtDay, fmtTime, indexTeams, roundTitle } from "@/components/sports/sports-ui";
import { useSportsData } from "@/lib/use-sports-data";
import { LeagueArt } from "@/components/plus/sports";

export default function SportsHubPage() {
  const { data, loading, error } = useSportsData();
  const teams = useMemo(() => indexTeams(data), [data]);
  const leagues = useMemo(() => new Map(data.leagues.map((l) => [l.id, l])), [data.leagues]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const upcoming = useMemo(
    () => data.events.filter((e) => e.status === "scheduled" && new Date(e.startsAt).getTime() >= now - 3 * 3600_000).slice(0, 5),
    [data.events, now]
  );

  return (
    <main className="page">
      <h1 className="h1" style={{ marginBottom: 24 }}>
        Sports
      </h1>
      {loading ? (
        <div className="leagues" aria-label="Loading">
          <div className="league ph-box" />
          <div className="league ph-box" />
        </div>
      ) : data.leagues.length === 0 ? (
        <div className="empty">{error ? "Sports couldn't load. Check your connection and try again." : "Leagues and fixtures show up here once they're set up."}</div>
      ) : (
        <div className="leagues">
          {data.leagues.map((l) => (
            <Link key={l.id} href={`/plus/sports/${l.slug}`} className="league">
              <LeagueArt league={l} />
              <div className="copy">
                {l.logoUrl && <img src={l.logoUrl} alt="" />}
                <div style={{ minWidth: 0 }}>
                  <div className="n">{l.name}</div>
                  <div className="s">
                    {l.sport} · {l.season}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <h2 className="h2" style={{ margin: "40px 0 16px" }}>
            Coming up
          </h2>
          <div className="upnexts">
            {upcoming.map((e) => {
              const l = leagues.get(e.leagueId);
              const tag = broadcastLabel(e.id, data.broadcasts);
              return (
                <Link key={e.id} href={l ? `/plus/sports/${l.slug}` : "/plus/sports"} className="upnext">
                  <div className="num" style={{ font: "600 15px/1.3 var(--body)" }}>
                    {fmtDay(e.startsAt)}
                    <br />
                    <span className="muted">{fmtTime(e.startsAt)}</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "700 18px/1.25 var(--body)" }}>{roundTitle(e, teams)}</div>
                    <div className="muted" style={{ fontSize: 14 }}>
                      {[l?.name, tag].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
