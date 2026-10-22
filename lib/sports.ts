// Scoring rules and standings for FTN+ Sports. Everything here is pure so the
// public pages, the API and the admin preview all compute standings the same way.

export interface TeamRules {
  win: number;
  draw: number;
  loss: number;
  /** Points for a loss that went to overtime (hockey). */
  overtimeLoss: number;
}

export interface RacingRules {
  /** Points by finishing position, first entry is 1st place. */
  points: number[];
  fastestLapPoint: number;
}

export type LeagueKind = "racing" | "team";

export const DEFAULT_TEAM_RULES: TeamRules = { win: 3, draw: 1, loss: 0, overtimeLoss: 0 };
export const DEFAULT_RACING_RULES: RacingRules = {
  points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  fastestLapPoint: 0,
};

export function defaultRules(kind: LeagueKind): TeamRules | RacingRules {
  return kind === "racing" ? DEFAULT_RACING_RULES : DEFAULT_TEAM_RULES;
}

export function parseRules(kind: LeagueKind, json: string | null | undefined): TeamRules | RacingRules {
  try {
    const raw = json ? JSON.parse(json) : {};
    if (kind === "racing") {
      const points = Array.isArray(raw.points) ? raw.points.map(Number).filter((n: number) => Number.isFinite(n)) : null;
      return {
        points: points && points.length > 0 ? points : DEFAULT_RACING_RULES.points,
        fastestLapPoint: Number.isFinite(Number(raw.fastestLapPoint)) ? Number(raw.fastestLapPoint) : 0,
      };
    }
    const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);
    return {
      win: num(raw.win, DEFAULT_TEAM_RULES.win),
      draw: num(raw.draw, DEFAULT_TEAM_RULES.draw),
      loss: num(raw.loss, DEFAULT_TEAM_RULES.loss),
      overtimeLoss: num(raw.overtimeLoss, DEFAULT_TEAM_RULES.overtimeLoss),
    };
  } catch {
    return defaultRules(kind);
  }
}

export interface RaceResultEntry {
  driverId: string;
  position: number;
  /** dnf = did not finish, dsq = disqualified. Neither scores or counts as a finish. */
  status: "finished" | "dnf" | "dsq";
  fastestLap?: boolean;
  /** Finishing time or gap, shown as typed ("48:12.4", "+6.8"). */
  time?: string;
}

export type Scoring = "points" | "order";

export function parseRaceResults(json: string | null | undefined): RaceResultEntry[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r) => r && typeof r.driverId === "string" && Number.isFinite(Number(r.position)))
      .map((r) => ({
        driverId: r.driverId,
        position: Number(r.position),
        status: r.status === "dnf" ? "dnf" : r.status === "dsq" ? "dsq" : "finished",
        fastestLap: !!r.fastestLap,
        time: typeof r.time === "string" && r.time.trim() ? r.time.trim().slice(0, 20) : undefined,
      }));
  } catch {
    return [];
  }
}

export function racePoints(entry: RaceResultEntry, rules: RacingRules): number {
  if (entry.status !== "finished") return 0;
  const base = rules.points[entry.position - 1] ?? 0;
  return base + (entry.fastestLap ? rules.fastestLapPoint : 0);
}

export interface EventLike {
  status: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  overtime: boolean;
  resultsJson: string | null;
}

export interface TeamStandingRow {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  overtimeLosses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

export function computeTeamStandings(teamIds: string[], events: EventLike[], rules: TeamRules): TeamStandingRow[] {
  const rows = new Map<string, TeamStandingRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { teamId: id, played: 0, wins: 0, draws: 0, losses: 0, overtimeLosses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
      rows.set(id, r);
    }
    return r;
  };
  teamIds.forEach(row);

  for (const e of events) {
    if (e.status !== "final" || !e.homeTeamId || !e.awayTeamId || e.homeScore == null || e.awayScore == null) continue;
    const h = row(e.homeTeamId);
    const a = row(e.awayTeamId);
    h.played++;
    a.played++;
    h.goalsFor += e.homeScore;
    h.goalsAgainst += e.awayScore;
    a.goalsFor += e.awayScore;
    a.goalsAgainst += e.homeScore;
    if (e.homeScore === e.awayScore) {
      h.draws++;
      a.draws++;
      h.points += rules.draw;
      a.points += rules.draw;
      continue;
    }
    const [winner, loser] = e.homeScore > e.awayScore ? [h, a] : [a, h];
    winner.wins++;
    winner.points += rules.win;
    if (e.overtime) {
      loser.overtimeLosses++;
      loser.points += rules.overtimeLoss;
    } else {
      loser.losses++;
      loser.points += rules.loss;
    }
  }

  const sorted = Array.from(rows.values());
  sorted.forEach((r) => (r.goalDiff = r.goalsFor - r.goalsAgainst));
  sorted.sort((x, y) => y.points - x.points || y.goalDiff - x.goalDiff || y.goalsFor - x.goalsFor);
  return sorted;
}

export interface DriverStandingRow {
  driverId: string;
  teamId: string | null;
  races: number;
  wins: number;
  podiums: number;
  dnfs: number;
  points: number;
  /** Finishing position per round in date order; null for a DNF or disqualification. */
  finishes: (number | null)[];
  best: number | null;
  avgFinish: number | null;
}

export interface ConstructorStandingRow {
  teamId: string;
  wins: number;
  podiums: number;
  points: number;
}

export function computeRacingStandings(
  drivers: { id: string; teamId: string | null }[],
  teamIds: string[],
  events: Pick<EventLike, "status" | "resultsJson">[],
  rules: RacingRules,
  scoring: Scoring = "points"
): { drivers: DriverStandingRow[]; constructors: ConstructorStandingRow[] } {
  const dRows = new Map<string, DriverStandingRow>();
  drivers.forEach((d) =>
    dRows.set(d.id, {
      driverId: d.id, teamId: d.teamId, races: 0, wins: 0, podiums: 0, dnfs: 0, points: 0,
      finishes: [], best: null, avgFinish: null,
    })
  );
  const cRows = new Map<string, ConstructorStandingRow>();
  teamIds.forEach((id) => cRows.set(id, { teamId: id, wins: 0, podiums: 0, points: 0 }));

  // `events` must be in date order so `finishes` reads as the season's form.
  for (const e of events) {
    if (e.status !== "final") continue;
    for (const r of parseRaceResults(e.resultsJson)) {
      const d = dRows.get(r.driverId);
      if (!d) continue;
      const pts = scoring === "points" ? racePoints(r, rules) : 0;
      d.races++;
      d.points += pts;
      d.finishes.push(r.status === "finished" ? r.position : null);
      if (r.status !== "finished") d.dnfs++;
      else {
        if (r.position === 1) d.wins++;
        if (r.position <= 3) d.podiums++;
      }
      const c = d.teamId ? cRows.get(d.teamId) : undefined;
      if (c) {
        c.points += pts;
        if (r.status === "finished") {
          if (r.position === 1) c.wins++;
          if (r.position <= 3) c.podiums++;
        }
      }
    }
  }

  const cmp = <T extends { points: number; wins: number; podiums: number }>(x: T, y: T) =>
    scoring === "points"
      ? y.points - x.points || y.wins - x.wins || y.podiums - x.podiums
      : y.wins - x.wins || y.podiums - x.podiums;
  const drows = Array.from(dRows.values());
  for (const d of drows) {
    const done = d.finishes.filter((f): f is number => f !== null);
    d.best = done.length ? Math.min(...done) : null;
    d.avgFinish = done.length ? done.reduce((a, b) => a + b, 0) / done.length : null;
  }
  // Finishing-order ranking breaks remaining ties by best finish, then average finish.
  const driverCmp = (x: DriverStandingRow, y: DriverStandingRow) =>
    cmp(x, y) || (scoring === "order" ? (x.best ?? 99) - (y.best ?? 99) || (x.avgFinish ?? 99) - (y.avgFinish ?? 99) : 0);
  return {
    drivers: drows.sort(driverCmp),
    constructors: Array.from(cRows.values()).sort(cmp),
  };
}
