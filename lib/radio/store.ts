/**
 * Where the radio keeps its shared state in the ftn-radio bucket. Listeners
 * read these through the bucket's public domain (radio-files.euno.cc); only
 * the website writes them, after checking. Keep in step with
 * radio-engine/src/radio/config.ts.
 */
export const AUTODJ_KEY = "radio/autodj.json";
export const analysisKey = (songKey: string) => `analysis/${songKey}.json`;

export function radioBucket(): R2Bucket | null {
  return (process.env as unknown as { ftn_radio?: R2Bucket }).ftn_radio ?? null;
}

export function radioDb(): D1Database | null {
  return (process.env as unknown as { DB?: D1Database }).DB ?? null;
}

export const noStore = { "Cache-Control": "no-store" };
