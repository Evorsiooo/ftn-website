"use client";
// Small pieces the FTN+ sports pages share.
import type { SportsLeague, SportsTeam } from "@/lib/use-sports-data";

/** The league's banner, or its colour when it has none. */
export function LeagueArt({ league }: { league: SportsLeague }) {
  return league.bannerUrl ? (
    <img src={league.bannerUrl} alt="" />
  ) : (
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${league.color || "#3a2f22"}, #16110a 85%)` }} />
  );
}

/** A driver's Roblox headshot, or their initials. */
export function Ava({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (src) return <img className="ava" src={src} alt="" style={style} loading="lazy" />;
  return (
    <span className="ava" style={{ ...style, fontSize: Math.round(size * 0.36) }} aria-hidden>
      {name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()}
    </span>
  );
}

/** A team's logo as it is (no disc), or its short name. */
export function TeamLogo({ team, size = 28 }: { team?: SportsTeam; size?: number }) {
  if (team?.logoUrl) return <img src={team.logoUrl} alt="" loading="lazy" style={{ width: size, height: size, objectFit: "contain", flex: "none" }} />;
  return (
    <span className="ava" style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.32)) }} aria-hidden>
      {(team?.shortName || team?.name || "?").slice(0, 3).toUpperCase()}
    </span>
  );
}
