// FTN radio lab: replaces BitChord's automix/fetchAudio.ts (which fetched the
// track from YouTube). The radio's songs are plain files in the R2 bucket,
// served by the website; the key is what BitChord called the video id.
import { fileUrl } from './config';

export interface TrackAudio {
  bytes: ArrayBuffer;
  musicVideo: boolean;
}

const cache = new Map<string, Promise<ArrayBuffer>>();

/** The whole file, fetched once per page (the browser's HTTP cache holds it across visits). */
export function songBytes(key: string): Promise<ArrayBuffer> {
  let held = cache.get(key);
  if (!held) {
    held = fetch(fileUrl(key)).then((r) => {
      if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    held.catch(() => cache.delete(key));
    cache.set(key, held);
    while (cache.size > 6) cache.delete(cache.keys().next().value!);
  }
  return held;
}

/**
 * Songs whose file is a music video. BitChord reads this off the YouTube
 * stream (a picture wider than 1.2:1); the radio's files are audio only, so
 * the downloader reads it with the same rule and the library carries it.
 */
const musicVideos = new Set<string>();

/** Called with the library each time it is loaded. */
export function setMusicVideos(songs: { key: string; musicVideo?: boolean }[]): void {
  musicVideos.clear();
  for (const s of songs) if (s.musicVideo) musicVideos.add(s.key);
}

/** Adds songs' flags without forgetting the others (the Library's Prepare, which sees songs a few at a time). */
export function addMusicVideos(songs: { key: string; musicVideo?: boolean }[]): void {
  for (const s of songs) if (s.musicVideo) musicVideos.add(s.key);
  else musicVideos.delete(s.key);
}

export const isMusicVideo = (key: string): boolean => musicVideos.has(key);

export async function fetchTrackAudio(key: string): Promise<TrackAudio> {
  return { bytes: await songBytes(key), musicVideo: musicVideos.has(key) };
}
