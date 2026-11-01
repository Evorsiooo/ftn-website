import { getDb } from "@/db";
import { getSecureRadioSettings, getStreamConfig, fetchTrackInfo } from "@/lib/radio";
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

// What the stream says is playing right now, read on the server so a vote can only
// ever be cast for the real current song, never for a title a client made up.
export async function getCurrentSong(d1: D1Database): Promise<CurrentSong | null> {
  const db = getDb(d1);
  const [secure, stream] = await Promise.all([getSecureRadioSettings(db), getStreamConfig(db)]);
  const info = await fetchTrackInfo(secure, stream);
  if (!info.online) return null;
  const artist = clip(info.artist);
  const title = clip(info.title);
  if (!title) return null;
  return { key: songKeyFor(artist, title), artist, title };
}
