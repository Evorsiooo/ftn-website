import { getDb } from "@/db";
import { getSecureRadioSettings, getStreamConfig, getPublicRadioSettings, fetchTrackInfo, isRealTrack } from "@/lib/radio";
import { loadShowsAndBroadcasts, resolveCurrentAndNext } from "@/lib/schedule";
import { decodeEntities } from "@/lib/html-entities";

export interface CurrentSong {
  key: string;
  artist: string;
  title: string;
}

const clip = (v: string) => decodeEntities(v || "").replace(/\s+/g, " ").trim().slice(0, 200);

// A song is identified by its lower-cased artist and title, so the same track
// gets the same key every time the stream reports it.
export function songKeyFor(artist: string, title: string): string {
  return `${clip(artist).toLowerCase()}|${clip(title).toLowerCase()}`;
}

// What the stream says is playing right now, read on the server so a vote can only ever be cast for
// the real current song, never for a title a client made up. Returns null when nothing votable is
// on: the stream is off, a show is scheduled on air (a live host may be speaking), or the metadata
// is not a real artist and title.
export async function getCurrentSong(d1: D1Database): Promise<CurrentSong | null> {
  const db = getDb(d1);
  const [secure, stream, pub, data] = await Promise.all([
    getSecureRadioSettings(db),
    getStreamConfig(db),
    getPublicRadioSettings(db),
    loadShowsAndBroadcasts(db).catch(() => ({ shows: [], broadcasts: [] })),
  ]);
  if (!pub.songDetection) return null;
  const { current } = resolveCurrentAndNext(data.shows, data.broadcasts);
  if (current) return null;
  const info = await fetchTrackInfo(secure, stream);
  if (!info.online || !isRealTrack(info.artist, info.title, [pub.stationName])) return null;
  const artist = clip(info.artist);
  const title = clip(info.title);
  return { key: songKeyFor(artist, title), artist, title };
}
