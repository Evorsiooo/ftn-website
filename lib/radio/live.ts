import type { DbClient } from "@/db";
import { fetchTrackInfo, getSecureRadioSettings, getStreamConfig } from "@/lib/radio";
import { radioBucket } from "./store";

/**
 * Whether someone is broadcasting to Icecast (OBS). With the AutoDJ running in
 * listeners' browsers, Icecast has no source the rest of the time, so a source
 * on it means a live show: players switch to the Icecast stream until it ends.
 *
 * The state is kept in the radio bucket (radio/live.json), which players read
 * from its public domain, so watching it costs the website no requests. The
 * every-minute cron call (app/api/sync/live-cron) refreshes it, and writes
 * only when it changes.
 */
export const LIVE_KEY = "radio/live.json";

export interface RadioLive {
  live: boolean;
  /** ISO time the current state began. */
  since: string;
}

export async function syncRadioLive(db: DbClient): Promise<RadioLive | null> {
  const bucket = radioBucket();
  if (!bucket) return null;
  const [secure, stream] = await Promise.all([getSecureRadioSettings(db), getStreamConfig(db)]);
  const { online } = await fetchTrackInfo(secure, stream);
  const stored = await bucket.get(LIVE_KEY);
  const current = stored ? ((await stored.json()) as RadioLive) : null;
  if (current && current.live === online) return current;
  const next: RadioLive = { live: online, since: new Date().toISOString() };
  await bucket.put(LIVE_KEY, JSON.stringify(next), { httpMetadata: { contentType: "application/json" } });
  return next;
}
