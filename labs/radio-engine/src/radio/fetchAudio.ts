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

export async function fetchTrackAudio(key: string): Promise<TrackAudio> {
  return { bytes: await songBytes(key), musicVideo: false };
}
