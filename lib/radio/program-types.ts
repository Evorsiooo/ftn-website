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
  /** Playlist shows: the playlist's songs (R2 keys); the AutoDJ shuffles them. */
  playlist?: string[];
  /** Playlist shows: the playlist's id, which its shuffle's progress is kept under (RadioTimeline.playlists). */
  playlistId?: string;
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
  /** Volume set by a host (1 = as levelled); the person's own browser applies it. */
  gain?: number;
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

/** Where a playlist's shuffle has got to (RadioTimeline.playlists; the same shape, declared here to keep this file import-free). */
export interface ShuffleProgress {
  cycle: number;
  played: string[];
}

/** A small string hash (FNV-1a), for seeding. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** [keys] in the shuffled order of [playlistId]'s round [cycle]: the same order in every browser, a new one each round. */
export function playlistOrder(keys: string[], playlistId: string, cycle: number): string[] {
  const out = [...keys].sort();
  let a = hash(`${playlistId}:${cycle}`);
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The next song the AutoDJ should line up for a song starting at [startMs], given the songs
 * already in the running order ([recent], oldest first), the playable library keys and the playlist
 * shows' progress. Returns null to let the AutoDJ pick from the whole library.
 *
 * - A Studio show: the hosts' queue first.
 * - A playlist show (Adrien, 2026-11-25): the playlist is shuffled once and played in that order, each
 *   song once; the next airing carries on where the last one stopped, and once every song has played
 *   the playlist is shuffled again. The website keeps the progress (withPlaylistPlays).
 */
export function programPick(p: RadioProgram | null, startMs: number, recent: string[], playable: Set<string>, progress?: Record<string, ShuffleProgress>): string | null {
  if (!p) return null;
  if (p.studio && p.studio.pausedAt === null) {
    const q = p.studio.queue.find((k) => playable.has(k) && !recent.slice(-3).includes(k));
    if (q) return q;
  }
  const a = airingAt(p, startMs);
  if (a?.plays === "playlist" && a.playlist?.length) {
    const list = a.playlist.filter((k) => playable.has(k));
    if (!list.length) return null;
    const id = a.playlistId ?? a.id;
    const prog = progress?.[id] ?? { cycle: 0, played: [] };
    const done = new Set(prog.played);
    let left = playlistOrder(list, id, prog.cycle).filter((k) => !done.has(k));
    // every song has played: the next round, shuffled again
    if (!left.length) left = playlistOrder(list, id, prog.cycle + 1);
    // not straight after itself (the end of one round and the start of the next, or a song just lined up)
    return left.find((k) => !recent.slice(-3).includes(k)) ?? left[0]!;
  }
  return null;
}
