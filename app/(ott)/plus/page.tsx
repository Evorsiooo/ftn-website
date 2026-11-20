"use client";
export const runtime = "edge";
import Link from "next/link";
import { useMemo } from "react";
import { useFTNPlus } from "@/lib/ftnplus-context";
import { useContinueWatching } from "@/lib/watch-progress";
import { watchPath } from "@/lib/plus-links";
import { CardsLoading, ChannelLogo, VideoCard, toVideo, type PlusVideo } from "@/components/plus/cards";
import { LiveMark } from "@/components/plus/live";
import { RadioRow } from "@/components/plus/radio-row";
import { ReplaysRow } from "@/components/plus/replays";
import { useSaved } from "@/components/plus/saved";
import * as I from "@/components/plus/icons";

/** Home: the featured video (a live stream takes its place), then what's new, the radio, and the curated rows. */
export default function FTNPlusHomePage() {
  const { featuredVideo, allVideos, trendingRaw, customSwimlanes, loadingLibrary, error, refreshLibrary } = useFTNPlus();
  const continueItems = useContinueWatching();

  const all = useMemo(() => allVideos.map(toVideo), [allVideos]);
  const byId = useMemo(() => new Map(all.map((v) => [v.id, v])), [all]);
  const featured = featuredVideo ? toVideo(featuredVideo) : null;
  const latest = all.filter((v) => !v.live).slice(0, 6);
  const trending = trendingRaw.map(toVideo).filter((v) => v.id !== featured?.id).slice(0, 6);
  const resume = continueItems.map((p) => ({
    v:
      byId.get(p.youtubeId) ??
      ({
        id: p.youtubeId,
        title: p.title,
        channel: p.channelTitle || "FTN",
        channelId: p.channelId || "",
        logo: p.channelLogoUrl || null,
        description: "",
        thumb: p.thumbnailUrl,
        publishedAt: new Date(p.updatedAt).toISOString(),
        live: false,
        stream: false,
        durationSec: p.duration,
      } satisfies PlusVideo),
    progress: (p.position / p.duration) * 100,
    left: Math.max(1, Math.round((p.duration - p.position) / 60)),
  }));

  if (!loadingLibrary && !featured) {
    return (
      <main className="page">
        <div className="empty">
          <h1 className="h2">{error ? "FTN+ couldn't load" : "Nothing here yet"}</h1>
          <div>{error ? "Check your connection and try again." : "Videos and streams show up here as soon as they're published."}</div>
          {error && (
            <div style={{ marginTop: 20 }}>
              <button className="btn sec" onClick={() => refreshLibrary()}>
                Try again
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main>
      {featured ? <Hero v={featured} /> : <section className="hero ph-box" style={{ borderRadius: 0 }} aria-label="Loading" />}

      {resume.length > 0 && (
        <>
          <div className="rowh">
            <h2 className="h2">Continue watching</h2>
          </div>
          <div className="cards one-row">
            {resume.map(({ v, progress, left }) => (
              <VideoCard key={v.id} v={v} progress={progress} sub={`${left} min left`} />
            ))}
          </div>
        </>
      )}

      <div className="rowh">
        <h2 className="h2">Latest</h2>
        <Link href="/plus/videos">See all</Link>
      </div>
      {loadingLibrary ? (
        <CardsLoading />
      ) : (
        <div className="cards one-row">
          {latest.map((v) => (
            <VideoCard key={v.id} v={v} />
          ))}
        </div>
      )}

      <RadioRow />
      <ReplaysRow />

      {trending.length > 0 && (
        <>
          <div className="rowh">
            <h2 className="h2">Trending</h2>
          </div>
          <div className="cards one-row">
            {trending.map((v) => (
              <VideoCard key={v.id} v={v} />
            ))}
          </div>
        </>
      )}

      {customSwimlanes
        .filter((l) => l.videos?.length)
        .map((l, i, lanes) => (
          <div key={l.id}>
            <div className="rowh">
              <h2 className="h2">{l.title}</h2>
            </div>
            <div className="cards one-row" style={i === lanes.length - 1 ? { paddingBottom: 64 } : undefined}>
              {l.videos.slice(0, 6).map((raw: any) => {
                const v = toVideo(raw);
                return <VideoCard key={v.id} v={v} />;
              })}
            </div>
          </div>
        ))}
      <div style={{ height: 64 }} />
    </main>
  );
}

function Hero({ v }: { v: PlusVideo }) {
  const { saved, toggle } = useSaved(v.live ? null : v);
  return (
    <section className="hero">
      <img src={v.thumb.replace(/\/(hq|mq|sd)default\.jpg$/, "/maxresdefault.jpg")} alt="" onError={(e) => (e.currentTarget.src = v.thumb)} />
      <div className="copy">
        <div className="chan">
          <ChannelLogo v={v} />
          {v.channel}
          {v.live && <LiveMark inline />}
        </div>
        <h1>{v.title}</h1>
        {!v.live && v.description && <p>{v.description}</p>}
        <div className="acts">
          <Link href={watchPath(v.id)} className="btn main lg">
            <I.Play />
            {v.live ? "Watch" : "Play"}
          </Link>
          {!v.live && (
            <button className="btn sec lg" aria-pressed={saved} onClick={toggle}>
              {saved ? <I.Saved /> : <I.Save />}
              {saved ? "Saved" : "Save"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
