import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  getPublicRadioSettings,
  getSecureRadioSettings,
  getStreamConfig,
  fetchTrackInfo,
  lookupAlbumArt,
} from "@/lib/radio";
import { loadShowsAndBroadcasts, resolveCurrentAndNext } from "@/lib/schedule";

export const runtime = "edge";

// Public: what is on air right now. Never exposes secure radio settings.
export async function GET() {
  const empty = {
    online: false,
    stationName: "FTN Radio",
    discordBot: { link: "", command: "/setup" },
    track: null,
    listeners: null,
    artUrl: null,
    currentShow: null,
    nextShow: null,
  };
  try {
    const d1 = (process.env as any).DB as D1Database;
    if (!d1) return NextResponse.json(empty);
    const db = getDb(d1);

    // The schedule is optional here: if it can't be loaded the stream still reports
    // its own online state and track, just without show info.
    const [pub, secure, stream, data] = await Promise.all([
      getPublicRadioSettings(db),
      getSecureRadioSettings(db),
      getStreamConfig(db),
      loadShowsAndBroadcasts(db).catch((err) => {
        console.error("now-playing: schedule unavailable:", err);
        return { shows: [], broadcasts: [] };
      }),
    ]);

    const { current, next } = resolveCurrentAndNext(data.shows, data.broadcasts);
    const trackInfo = await fetchTrackInfo(secure, stream);
    const hasTrack = trackInfo.online && (trackInfo.artist || trackInfo.title);

    // Show art wins while a show is scheduled; otherwise fall back to the track's cover art.
    let artUrl: string | null = current?.show?.artUrl || null;
    if (!artUrl && hasTrack) artUrl = await lookupAlbumArt(trackInfo.artist, trackInfo.title, secure);
    if (!artUrl) artUrl = pub.defaultArtUrl || null;

    const mapOcc = (o: typeof current) =>
      o && {
        name: o.show!.name,
        presenter: o.show!.presenter,
        description: o.show!.description,
        artUrl: o.show!.artUrl,
        tag: o.tag,
        start: o.start.toISOString(),
        end: o.end.toISOString(),
      };

    return NextResponse.json(
      {
        online: trackInfo.online,
        stationName: pub.stationName,
        discordBot: { link: pub.discordBotLink, command: pub.discordBotCommand },
        track: hasTrack ? { artist: trackInfo.artist, title: trackInfo.title } : null,
        listeners: trackInfo.listeners,
        artUrl,
        currentShow: mapOcc(current),
        nextShow: mapOcc(next),
      },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } }
    );
  } catch (err) {
    console.error("now-playing error:", err);
    return NextResponse.json(empty);
  }
}
