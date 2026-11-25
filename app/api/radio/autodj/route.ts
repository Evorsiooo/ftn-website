import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { checkTimelineChange, onAirSongs, repeatWindow, REPEAT_WINDOW, withPlayed, type RadioTimeline } from "@/lib/radio/autodj";
import { cachedPlayableSongs, songsByKeys } from "@/lib/radio/library";
import { recordMixReport } from "@/lib/radio/mix-reports";
import { PROGRAM_KEY, type RadioProgram } from "@/lib/radio/program-types";
import { notThePick, repeatProblem, ROTATION_VERSION, withPlaylistPlays } from "@/lib/radio/rotation";
import { serverPick } from "@/lib/radio/server-pick";
import { AUTODJ_KEY, noStore, radioBucket, radioDb } from "@/lib/radio/store";
import { logTimeline, markQueuedPlayed } from "@/lib/radio/studio";

export const runtime = "edge";

/**
 * The AutoDJ's running order. Listeners read it from the bucket's public
 * domain; when it runs short one of them POSTs a longer one here. The website
 * only checks and stores: new songs must be in the library, nothing already
 * playing or about to play may change, every mix must stay within safe
 * volume, filter and speed bounds, no new song may have played within the last
 * 200 (lib/radio/rotation.ts), and the change must build on the stored
 * revision (the first listener to send one wins; the others re-read it).
 */
/** A library a little smaller than when the browser looked (songs archived since) mustn't make a fair pick a repeat. */
const WINDOW_SLACK = 10;

export async function POST(request: NextRequest) {
  const bucket = radioBucket();
  const db = radioDb();
  if (!bucket || !db) return NextResponse.json({ error: "Radio storage unavailable" }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({ error: "too big" }, { status: 413 });
  let next: unknown;
  try {
    next = (JSON.parse(raw) as { timeline?: unknown }).timeline;
  } catch {
    return NextResponse.json({ error: "not JSON" }, { status: 400 });
  }
  const stored = await bucket.get(AUTODJ_KEY);
  const current = stored ? ((await stored.json()) as RadioTimeline) : null;
  const items = (next as { items?: unknown })?.items;
  const keys = Array.isArray(items) ? items.map((i) => String((i as { key?: unknown })?.key)) : [];
  const now = Date.now();
  const known = await songsByKeys(getDb(db), keys);
  const error = checkTimelineChange(current, next, now, known);
  if (error) {
    const stale = current !== null && (next as { rev?: unknown })?.rev !== current.rev + 1;
    const bad = /^mix (\d+): (.*)$/.exec(error);
    if (bad && !stale) {
      const tl = next as RadioTimeline;
      const i = Number(bad[1]);
      await recordMixReport({ from: tl.items[i]!.key, to: tl.items[i + 1]!.key, style: String(tl.mixes[i]?.style), problem: bad[2]!, where: "website" });
    }
    return NextResponse.json({ error }, { status: stale ? 409 : 422, headers: noStore });
  }
  // the play history and the playlist shows' progress are the website's to keep (the next-song picker
  // reads them), whatever was sent; "picker" is only what the sender says about itself
  const { picker, ...sent } = next as RadioTimeline;
  let out = withPlayed(current, sent as RadioTimeline, now);
  const program = await readProgram(bucket);
  const repeats = repeatProblem(current, out, now, program);
  if (repeats.length) {
    // the window shrinks for a small library (repeatWindow), as the browsers' picker does
    const n = repeats.some((r) => r.ago < REPEAT_WINDOW - WINDOW_SLACK) ? onAirSongs(await cachedPlayableSongs(getDb(db))).length : Infinity;
    const window = Math.max(0, repeatWindow(n) - WINDOW_SLACK);
    const real = repeats.filter((r) => r.ago < window);
    if (real.length) {
      const msg = `played ${real[0]!.ago + 1} songs ago: ${real[0]!.key}`;
      // a player loaded before the rules came in (a tab left open): let it through rather than stop the radio
      if ((picker ?? 0) >= ROTATION_VERSION) return NextResponse.json({ error: msg }, { status: 422, headers: noStore });
      console.warn(`radio: repeat from an older player let through (${msg})`);
    }
  }
  // the song the website picked for this place (none for a fresh start, or after a show's song)
  const wrong = notThePick(current, out, now, program);
  if (wrong) {
    const msg = `not the song the website picked: ${wrong}`;
    if ((picker ?? 0) >= ROTATION_VERSION) return NextResponse.json({ error: msg }, { status: 422, headers: noStore });
    console.warn(`radio: older player's pick let through (${msg})`);
  }
  out = withPlaylistPlays(current, out, now, program);
  // and the song to follow the new last one, for the browser that plans the next mix
  try {
    out = { ...out, nextPick: await serverPick(getDb(db), bucket, out, known) };
  } catch (err) {
    console.error("radio: picking the next song", err);
    out = { ...out, nextPick: null };
  }
  next = out;
  // only over the revision that was checked: two listeners sending at once can't both win
  const put = await bucket.put(AUTODJ_KEY, JSON.stringify(next), {
    httpMetadata: { contentType: "application/json" },
    onlyIf: stored ? { etagMatches: stored.etag } : { uploadedBefore: new Date(0) },
  });
  if (!put) return NextResponse.json({ error: "someone else was first" }, { status: 409, headers: noStore });
  // Studio: queued songs now lined up leave the queue; replays being recorded keep a copy
  try {
    const stored = next as RadioTimeline;
    const before = new Set(current?.items.map((i) => i.key) ?? []);
    await markQueuedPlayed(getDb(db), stored.items.map((i) => i.key).filter((k) => !before.has(k)));
    await logTimeline(getDb(db), stored);
  } catch (err) {
    console.error("radio: after storing the running order", err);
  }
  return NextResponse.json({ rev: (next as RadioTimeline).rev }, { headers: noStore });
}

async function readProgram(bucket: R2Bucket): Promise<RadioProgram | null> {
  try {
    const obj = await bucket.get(PROGRAM_KEY);
    return obj ? ((await obj.json()) as RadioProgram) : null;
  } catch {
    return null;
  }
}
