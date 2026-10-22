// Shape of /api/plus/now. Kept apart from the loader so client code can import it without the database.
export interface PlusNowLive {
  id: string;
  title: string;
  thumbnailUrl: string;
  channelTitle: string;
}

export interface PlusNowSportsEvent {
  leagueSlug: string;
  leagueName: string;
  kind: "racing" | "team";
  label: string;
  home: string | null;
  away: string | null;
  homeScore: number | null;
  awayScore: number | null;
  overtime: boolean;
  startsAt: string;
}

export interface PlusNow {
  live: PlusNowLive[];
  radio: { show: string; presenter: string | null; artUrl: string | null } | null;
  next: { title: string; start: string; onRadio: boolean; onStream: boolean; youtubeId: string | null } | null;
  result: PlusNowSportsEvent | null;
  upcoming: PlusNowSportsEvent | null;
}

export const EMPTY_PLUS_NOW: PlusNow = { live: [], radio: null, next: null, result: null, upcoming: null };
