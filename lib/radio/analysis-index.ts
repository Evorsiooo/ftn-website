import { ANALYSIS_VERSION, summarizeAnalysis, type AnalysisIndex } from "@/lib/radio/autodj";
import { ANALYSIS_INDEX_KEY } from "@/lib/radio/store";
import { PICK_META_KEY, writePickGroups } from "@/lib/radio/server-pick";
import type { DbClient } from "@/db";
import { markAnalysed } from "@/lib/radio/prep";

/** Written once the songs analysed before "Getting ready" (migration 0036) have been marked as analysed. */
const BACKFILL_MARKER = "radio/cache/analysed-backfill-v1";

const PREFIX = "analysis/";
/** Analyses read per run: the index catches up over a few minutes after a new analysis version. */
const READS_PER_RUN = 25;

/**
 * Keeps radio/analysis-index.json in step with the shared analyses (analysis/<song>.json): adds the
 * ones it doesn't have yet (a few per run) and drops the ones that were deleted. Called by the
 * every-minute cron, the index's only writer; listeners read it from the bucket's public domain
 * when they pick the next song. An analysis of another version is kept out of the index.
 */
export async function refreshAnalysisIndex(bucket: R2Bucket, db?: DbClient): Promise<{ added: number; removed: number; total: number; waiting: number }> {
  const stored = await bucket.get(ANALYSIS_INDEX_KEY);
  let index: AnalysisIndex = { analysisVersion: ANALYSIS_VERSION, songs: {} };
  if (stored) {
    const body = (await stored.json().catch(() => null)) as AnalysisIndex | null;
    if (body && body.analysisVersion === ANALYSIS_VERSION && body.songs) index = body;
  }

  const present: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const o of page.objects) if (o.key.endsWith(".json")) present.push(o.key.slice(PREFIX.length, -".json".length));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  // once: every song whose analysis was shared before songs had an "analysed" date gets one (a few hundred
  // rows, by their unique key), so they are on air straight away
  if (db && !(await bucket.head(BACKFILL_MARKER))) {
    try {
      await markAnalysed(db, present);
      await bucket.put(BACKFILL_MARKER, new Date().toISOString());
    } catch {
      // tried again next minute; the index itself carries on
    }
  }

  const keep = new Set(present);
  let removed = 0;
  for (const key of Object.keys(index.songs)) {
    if (!keep.has(key)) {
      delete index.songs[key];
      removed++;
    }
  }
  const missing = present.filter((k) => !(k in index.songs));
  let added = 0;
  for (const key of missing.slice(0, READS_PER_RUN)) {
    const obj = await bucket.get(`${PREFIX}${key}.json`);
    const summary = obj ? summarizeAnalysis(await obj.json().catch(() => null)) : null;
    if (summary) {
      index.songs[key] = summary;
      added++;
    }
  }
  const total = Object.keys(index.songs).length;
  const waiting = missing.length - added;
  if (added || removed || !stored) {
    // only over what was read: a run that overlaps this one can't undo it
    const put = await bucket.put(ANALYSIS_INDEX_KEY, JSON.stringify(index), {
      httpMetadata: { contentType: "application/json" },
      onlyIf: stored ? { etagMatches: stored.etag } : undefined,
    });
    // the website's next-song picker reads the same summaries, split in groups (lib/radio/server-pick.ts)
    if (put) await writePickGroups(bucket, index).catch((err) => console.error("radio: pick groups", err));
  } else if (!(await bucket.head(PICK_META_KEY))) {
    await writePickGroups(bucket, index).catch((err) => console.error("radio: pick groups", err));
  }
  return { added, removed, total, waiting };
}
