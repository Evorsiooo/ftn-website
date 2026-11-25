// check_radio: the radio's state as it really works. Most of the time it's the 24/7 AutoDJ, played in
// listeners' browsers from the running order in R2; Icecast only carries live shows from OBS, so
// "no Icecast source" just means nobody is live.
import type { DbClient } from "@/db";
import { edgeReachable, getSecureRadioSettings, getStreamConfig, probeStream } from "@/lib/radio";
import { endOfTimelineMs, nowPlaying, recentlyPlayed, virtualOnAir, type RadioTimeline } from "@/lib/radio/autodj";
import { cachedPlayableSongs } from "@/lib/radio/library";
import { LIVE_KEY, type RadioLive } from "@/lib/radio/live";
import { AUTODJ_KEY, radioBucket } from "@/lib/radio/store";
import { loadShowsAndBroadcasts, resolveCurrentAndNext } from "@/lib/schedule";

const song = (s: { title: string; artist: string }) => `${s.title} by ${s.artist}`;
const secs = (n: number) => Math.max(0, Math.round(n));

export async function radioHealth(db: DbClient) {
  const problems: string[] = [];
  const now = Date.now();
  const bucket = radioBucket();
  if (!bucket) problems.push("The radio's storage (R2 bucket) isn't connected to the website.");

  const [library, tlObj, liveObj, schedule, secure, stream] = await Promise.all([
    cachedPlayableSongs(db).catch(() => null),
    bucket?.get(AUTODJ_KEY).catch(() => null),
    bucket?.get(LIVE_KEY).catch(() => null),
    loadShowsAndBroadcasts(db).catch(() => null),
    getSecureRadioSettings(db),
    getStreamConfig(db),
  ]);
  const tl = tlObj ? ((await tlObj.json().catch(() => null)) as RadioTimeline | null) : null;
  const live = liveObj ? ((await liveObj.json().catch(() => null)) as RadioLive | null) : null;

  if (library === null) problems.push("The song library couldn't be read.");
  else if (library.length === 0) problems.push("The song library has no playable songs, so the AutoDJ has nothing to play.");

  // What the AutoDJ plays now. Listeners extend the running order while someone listens; with nobody
  // listening it runs out, and the site shows a "virtual" pick that is what a listener would get.
  let autodj: Record<string, unknown>;
  const np = tl && endOfTimelineMs(tl) > now ? nowPlaying(tl, now) : null;
  if (np) {
    const i = np.slot.itemIndex;
    const next = tl!.items[i + 1];
    autodj = {
      state: "playing",
      nowPlaying: song(np.slot.item),
      secondsIn: secs(np.positionSec),
      secondsLeft: secs((np.slot.endMs - now) / 1000),
      next: next ? song(next) : null,
      runningOrderEndsAt: new Date(endOfTimelineMs(tl!)).toISOString(),
    };
  } else {
    const v = library?.length ? virtualOnAir(library, now) : null;
    autodj = v
      ? {
          state: "idle",
          note: "Nobody is listening right now, so no running order is being built. That's normal: the first listener starts it, from this song.",
          wouldPlay: song(v.song),
          secondsIn: secs(v.positionSec),
          next: song(v.next),
        }
      : { state: "nothing to play" };
  }

  // The Radio page's "Recently played" list, worked out the same way (lib/radio/autodj.ts).
  const recent = library?.length ? recentlyPlayed(tl, library, now, 8).map((s) => ({ song: song(s), startedAt: new Date(s.at).toISOString() })) : [];

  const { current, next } = schedule ? resolveCurrentAndNext(schedule.shows, schedule.broadcasts) : { current: null, next: null };
  const show = (o: typeof current) =>
    o && { name: o.show?.name ?? null, presenter: o.show?.presenter ?? null, starts: new Date(o.start).toISOString(), ends: new Date(o.end).toISOString() };
  if (!schedule) problems.push("The schedule couldn't be read.");

  // Live from OBS: only then does Icecast carry the radio.
  const probe = stream.streamUrl ? await probeStream(stream.streamUrl) : null;
  const isLive = !!live?.live || !!probe?.ok;
  const obsLive = {
    live: isLive,
    note: isLive
      ? "Someone is live from OBS: listeners hear the Icecast stream instead of the AutoDJ."
      : "Nobody is live from OBS. That's normal: Icecast is only used for live OBS shows, and the AutoDJ plays the rest of the time.",
    ...(live?.since ? { since: live.since } : {}),
    ...(secure.icecastAdminUrl && !edgeReachable(secure.icecastAdminUrl)
      ? { icecastAdmin: "The Icecast admin address is local to the radio server, so the website doesn't check it (not a problem)." }
      : {}),
  };

  return {
    ok: problems.length === 0,
    problems,
    autodj,
    recentlyPlayed: recent,
    library: library ? { playableSongs: library.length } : null,
    schedule: { onNow: show(current), upNext: show(next) },
    obsLive,
  };
}
