// Mixes the safety checks refused (volume, filters, speed, timing: checkMix in lib/radio/autodj.ts). The song
// then plays to its end with no mix, and the radio can restart mid-song. Nobody knew how often that happens,
// so both places that refuse one write it down here: a listener's browser (before sending, /api/radio/mix-report)
// and the website (a change it was sent). The radio check (lib/mcp/radio-health.ts) reads the counts.

import { radioBucket } from "./store";

export const MIX_REPORTS_KEY = "radio/logs/rejected-mixes.json";
const MAX_ENTRIES = 100;
/** The same two songs refused again within this long count as the same report (several listeners try each mix). */
const SAME_REPORT_MS = 30 * 60_000;

export interface MixReport {
  /** Server ms, first and latest time it was reported. */
  at: number;
  lastAt: number;
  from: string;
  to: string;
  style: string;
  problem: string;
  where: "browser" | "website";
  count: number;
}

export async function readMixReports(): Promise<MixReport[]> {
  const obj = await radioBucket()?.get(MIX_REPORTS_KEY);
  return obj ? (((await obj.json().catch(() => null)) as { reports?: MixReport[] } | null)?.reports ?? []) : [];
}

/** Adds a report (or counts it again), keeping the latest MAX_ENTRIES. Never throws. */
export async function recordMixReport(r: Pick<MixReport, "from" | "to" | "style" | "problem" | "where">, now = Date.now()): Promise<void> {
  try {
    const bucket = radioBucket();
    if (!bucket) return;
    const reports = await readMixReports();
    const same = reports.find((x) => x.from === r.from && x.to === r.to && now - x.lastAt < SAME_REPORT_MS);
    if (same) {
      same.count++;
      same.lastAt = now;
    } else reports.unshift({ ...r, at: now, lastAt: now, count: 1 });
    await bucket.put(MIX_REPORTS_KEY, JSON.stringify({ reports: reports.slice(0, MAX_ENTRIES) }), { httpMetadata: { contentType: "application/json" } });
  } catch (err) {
    console.error("radio: couldn't record a refused mix", err);
  }
}
