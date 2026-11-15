// What the radio is doing besides the 24/7 AutoDJ: scheduled airings (a playlist show, another
// station's stream, a hosted show) and the Studio show on air. The website keeps it in the radio
// bucket (radio/program.json); listeners' browsers read it from the public domain. No imports, so
// the radio engine (radio-engine/) can share this file.

export const PROGRAM_KEY = "radio/program.json";

export interface ProgramAiring {
  /** broadcastId:startMs */
  id: string;
  start: number;
  end: number;
  plays: "hosted" | "playlist" | "stream";
  title: string;
  art: string | null;
  /** Playlist shows: the playlist's songs (R2 keys), in order. */
  playlist?: string[];
  /** Stream shows: the https stream to play. */
  stream?: string;
}

export interface ProgramVoice {
  /** The person's row id in the Studio. */
  id: string;
  name: string;
  avatar: string | null;
  role: "host" | "cohost" | "caller";
  /** Their voice on Cloudflare Realtime (pulled by listeners), once they are connected. */
  session: string | null;
  track: string | null;
}

export interface ProgramStudio {
  id: string;
  title: string;
  art: string | null;
  callIn: boolean;
  /** Server ms the music was paused at (a host pressed pause), or null. */
  pausedAt: number | null;
  /** Songs queued by the hosts (R2 keys), next first. */
  queue: string[];
  voices: ProgramVoice[];
}

export interface RadioProgram {
  updatedAt: number;
  airings: ProgramAiring[];
  studio: ProgramStudio | null;
}

/** The airing on at [ms], if any. */
export function airingAt(p: RadioProgram | null, ms: number): ProgramAiring | null {
  return p?.airings.find((a) => a.start <= ms && a.end > ms) ?? null;
}

/**
 * The next song the AutoDJ should line up for a song starting at [startMs], given the songs
 * already in the running order ([recent], oldest first) and the playable library keys. Returns
 * null to let the AutoDJ pick from the whole library.
 *
 * - A Studio show: the hosts' queue first.
 * - A playlist show: the playlist, in order, carrying on after the last of its songs that played.
 */
export function programPick(p: RadioProgram | null, startMs: number, recent: string[], playable: Set<string>): string | null {
  if (!p) return null;
  if (p.studio && p.studio.pausedAt === null) {
    const q = p.studio.queue.find((k) => playable.has(k) && !recent.slice(-3).includes(k));
    if (q) return q;
  }
  const a = airingAt(p, startMs);
  if (a?.plays === "playlist" && a.playlist?.length) {
    const list = a.playlist.filter((k) => playable.has(k));
    if (!list.length) return null;
    let last = -1;
    for (let i = recent.length - 1; i >= 0 && last < 0; i--) last = list.indexOf(recent[i]!);
    return list[(last + 1) % list.length]!;
  }
  return null;
}
