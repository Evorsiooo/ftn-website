"use client";
import { useCallback, useEffect, useState } from "react";

export interface SportsLeague {
  id: string;
  slug: string;
  name: string;
  kind: "racing" | "team";
  sport: string;
  season: string;
  color: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  scoring: "points" | "order";
  constructors: boolean;
  rulesJson: string;
}
export interface SportsTeam {
  id: string;
  leagueId: string;
  name: string;
  shortName: string | null;
  color: string | null;
  logoUrl: string | null;
}
export interface SportsDriver {
  id: string;
  leagueId: string;
  teamId: string | null;
  name: string;
  number: number | null;
  robloxUsername: string | null;
}
export interface SportsVenue {
  id: string;
  name: string;
  photoUrl: string | null;
}
/** A scheduled broadcast linked to a sports event (drives the Livestream / Radio badges). */
export interface SportsBroadcast {
  sportsEventId: string;
  onRadio: boolean;
  onStream: boolean;
  youtubeId: string | null;
}
export interface SportsArticle {
  id: string;
  slug: string;
  title: string;
}
export interface SportsEvent {
  id: string;
  leagueId: string;
  name: string | null;
  round: number | null;
  venue: string | null;
  venueId: string | null;
  articleId: string | null;
  startsAt: string;
  status: "scheduled" | "final" | "postponed" | "cancelled";
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  overtime: boolean;
  resultsJson: string | null;
  videoUrl: string | null;
}
export interface SportsData {
  leagues: SportsLeague[];
  teams: SportsTeam[];
  drivers: SportsDriver[];
  events: SportsEvent[];
  venues: SportsVenue[];
  broadcasts: SportsBroadcast[];
  articles: SportsArticle[];
}

const EMPTY: SportsData = { leagues: [], teams: [], drivers: [], events: [], venues: [], broadcasts: [], articles: [] };

export function useSportsData() {
  const [data, setData] = useState<SportsData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/sports/data", { cache: "no-store" });
      const json = (await res.json()) as Partial<SportsData> & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load sports");
      setData({
        leagues: json.leagues ?? [],
        teams: json.teams ?? [],
        drivers: json.drivers ?? [],
        events: json.events ?? [],
        venues: json.venues ?? [],
        broadcasts: (json.broadcasts ?? []) as SportsBroadcast[],
        articles: json.articles ?? [],
      });
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load sports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
