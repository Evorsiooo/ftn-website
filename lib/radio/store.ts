import { type LibrarySong } from "./autodj";

/**
 * Where the radio engine lab keeps its shared state in the ftn-radio bucket.
 * Everything is under test/ until the real library exists (Library thread).
 */
export const AUTODJ_KEY = "test/autodj.json";
export const LIBRARY_KEY = "test/songs.json";
export const analysisKey = (songKey: string) => `test/analysis/${songKey.split("/").pop()}.json`;

export function radioBucket(): R2Bucket | null {
  return (process.env as unknown as { ftn_radio?: R2Bucket }).ftn_radio ?? null;
}

export async function loadLibrary(bucket: R2Bucket): Promise<Map<string, LibrarySong>> {
  const obj = await bucket.get(LIBRARY_KEY);
  const songs = obj ? ((await obj.json()) as LibrarySong[]) : [];
  return new Map(songs.map((s) => [s.key, s]));
}

export const noStore = { "Cache-Control": "no-store" };
