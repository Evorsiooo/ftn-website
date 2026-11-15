import { getDb } from "@/db";
import { getSecureRadioSettings, getStreamConfig, getPublicRadioSettings, fetchTrackInfo, isRealTrack } from "@/lib/radio";
import { loadShowsAndBroadcasts, resolveCurrentAndNext } from "@/lib/schedule";
import { decodeEntities } from "@/lib/html-entities";
import { nowPlaying, type RadioTimeline } from "@/lib/radio/autodj";
import { AUTODJ_KEY, radioBucket } from "@/lib/radio/store";
import { LIVE_KEY, type RadioLive } from "@/lib/radio/live";

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
export async function getCurrentSong(d1: D1Database, aMomentAgo = false): Promise<CurrentSong | null> {
  const fromAutoDj = await autoDjSong(aMomentAgo);
  if (fromAutoDj !== undefined) return fromAutoDj;
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

/**
 * The AutoDJ's song (keyed by its file in the radio bucket), from the stored running order and this server's
 * clock: what every listener hears. Undefined when an OBS show is on Icecast (then the stream's metadata
 * decides, as before) or the bucket isn't bound. [aMomentAgo]: the song 15 s ago, so a vote cast just as the
 * song changed still counts for the song the listener heard.
 */
async function autoDjSong(aMomentAgo: boolean): Promise<CurrentSong | null | undefined> {
  const bucket = radioBucket();
  if (!bucket) return undefined;
  const [liveObj, tlObj] = await Promise.all([bucket.get(LIVE_KEY), bucket.get(AUTODJ_KEY)]);
  const live = liveObj ? ((await liveObj.json().catch(() => null)) as RadioLive | null) : null;
  if (live?.live) return undefined;
  const tl = tlObj ? ((await tlObj.json().catch(() => null)) as RadioTimeline | null) : null;
  const np = tl ? nowPlaying(tl, Date.now() - (aMomentAgo ? 15_000 : 0)) : null;
  if (!np) return null;
  const it = np.slot.item;
  return { key: it.key, artist: clip(it.artist), title: clip(it.title) };
}
