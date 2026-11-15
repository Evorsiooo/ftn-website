"use client";
// Watch: the approved mockup's page. The video plays in YouTube's or Twitch's own player (their controls), the
// details sit under it, and "More from" the channel and Trending beside it. While the video plays, the radio (if
// on) is lowered under it and comes back up when the video stops. Resume, views and Saved work as before.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFTNPlus } from "@/lib/ftnplus-context";
import { isTwitchId, twitchLoginFromId } from "@/lib/twitch-id";
import { fetchServerProgress, isResumable, pushServerProgress, readLocalProgress, writeLocalProgress } from "@/lib/watch-progress";
import { useRadio } from "@/components/radio/radio-provider";
import { ChannelLogo, MiniCard, ago, cleanTitle, toVideo, type PlusVideo } from "./cards";
import { LiveMark } from "./live";
import { useSaved } from "./saved";
import * as I from "./icons";

export interface WatchProps {
  youtubeId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  channelLogoUrl: string;
  thumbnailUrl?: string;
  publishedAt?: string;
  isLive: boolean;
  /** A finished Twitch broadcast: plays its recording instead of the channel. */
  twitchVodId?: string;
  /** A finished Twitch broadcast; without a recording the video area says so. */
  broadcastEnded: boolean;
}

const YT_PLAYING = 1;
const YT_BUFFERING = 3;

export function PlusWatch(p: WatchProps) {
  const id = (p.youtubeId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const twitchLogin = isTwitchId(id) ? twitchLoginFromId(id) : null;
  const { allVideos, trendingRaw } = useFTNPlus();
  const radio = useRadio();
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [twitchParent, setTwitchParent] = useState<string | null>(null);
  const [startAt, setStartAt] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const noRecording = p.broadcastEnded && !p.twitchVodId && !!twitchLogin;

  const video: PlusVideo = useMemo(
    () => ({
      id,
      title: cleanTitle(p.title),
      channel: p.channelTitle || "FTN",
      channelId: p.channelId,
      logo: p.channelLogoUrl || null,
      description: p.description.trim(),
      thumb: p.thumbnailUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      publishedAt: p.publishedAt || new Date().toISOString(),
      live: p.isLive,
      stream: p.isLive,
      durationSec: 0,
    }),
    [id, p]
  );
  const { saved, toggle } = useSaved(noRecording ? null : video);

  useEffect(() => setTwitchParent(window.location.hostname), []);

  // A view, for Trending
  useEffect(() => {
    if (!id) return;
    fetch("/api/plus/views", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtubeId: id }) }).catch(() => {});
  }, [id]);

  // Resume position: the newest of this device's and the server's record.
  useEffect(() => {
    if (!id) return;
    if (p.isLive || twitchLogin) return setStartAt(0);
    let done = false;
    const finish = (s: number) => {
      if (done) return;
      done = true;
      setStartAt(s);
    };
    const local = readLocalProgress().find((x) => x.youtubeId === id);
    const timer = setTimeout(() => finish(local && isResumable(local) ? local.position : 0), 1200);
    fetchServerProgress().then((server) => {
      const remote = server.find((x) => x.youtubeId === id);
      const best = [local, remote].filter(Boolean).sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];
      clearTimeout(timer);
      finish(best && isResumable(best) ? best.position : 0);
    });
    return () => clearTimeout(timer);
  }, [id, p.isLive, twitchLogin]);

  // The radio goes down under a playing video. YouTube says when it plays or pauses; Twitch doesn't, so the radio
  // stays lowered while its player is open.
  const duck = radio.duck;
  const [ytPlaying, setYtPlaying] = useState(false);
  const lowered = playing && (twitchLogin ? !noRecording : ytPlaying);
  useEffect(() => {
    duck(lowered);
  }, [lowered, duck]);
  useEffect(() => () => duck(false), [duck]);

  // Watch position from the YouTube player (its postMessage API), and whether it's playing.
  useEffect(() => {
    if (!playing || twitchLogin || startAt === null) return;
    const frame = iframeRef.current;
    if (!frame) return;
    let position = 0;
    let duration = 0;
    let lastLocal = 0;
    let lastServer = 0;
    const save = (force?: boolean) => {
      if (p.isLive || !duration || position < 1) return;
      const now = Date.now();
      if (force || now - lastLocal > 5000) {
        lastLocal = now;
        writeLocalProgress({ youtubeId: id, position, duration, updatedAt: now, title: video.title, thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, channelId: p.channelId, channelTitle: p.channelTitle, channelLogoUrl: p.channelLogoUrl });
      }
      if (force || now - lastServer > 20000) {
        lastServer = now;
        pushServerProgress(id, position, duration);
      }
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || typeof e.data !== "string") return;
      try {
        const msg = JSON.parse(e.data);
        const info = msg?.info;
        if (msg?.event === "infoDelivery" && info) {
          if (typeof info.playerState === "number") setYtPlaying(info.playerState === YT_PLAYING || info.playerState === YT_BUFFERING);
          if (typeof info.currentTime === "number") position = info.currentTime;
          if (typeof info.duration === "number" && info.duration > 0) duration = info.duration;
          save();
        } else if (msg?.event === "onStateChange" && typeof msg.info === "number") {
          setYtPlaying(msg.info === YT_PLAYING || msg.info === YT_BUFFERING);
        }
      } catch {}
    };
    const listen = () => frame.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "ftn-player", channel: "widget" }), "*");
    frame.addEventListener("load", listen);
    window.addEventListener("message", onMessage);
    const onHide = () => save(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      frame.removeEventListener("load", listen);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", onHide);
      save(true);
    };
  }, [playing, id, twitchLogin, startAt, p.isLive, p.channelId, p.channelTitle, p.channelLogoUrl, video.title]);

  const all = useMemo(() => allVideos.map(toVideo), [allVideos]);
  const more = all.filter((x) => x.channel === video.channel && x.id !== id).slice(0, 4);
  const trending = trendingRaw.map(toVideo).filter((x) => x.id !== id && !more.some((m) => m.id === x.id)).slice(0, 6);
  const longDesc = video.description.length > 220 || video.description.split("\n").length > 4;
  const sourceHref = twitchLogin ? `https://www.twitch.tv/${twitchLogin}` : `https://www.youtube.com/watch?v=${id}`;

  const share = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const poster = video.thumb.replace(/\/(hq|mq|sd)default\.jpg$/, "/maxresdefault.jpg");
  return (
    <main className="watch">
      <div>
        <div className="player">
          {noRecording ? (
            <div className="ended">
              <div className="t">This broadcast has ended</div>
              <div className="s">Twitch no longer has a recording of it. Newer streams from {twitchLogin} are on their Twitch channel.</div>
            </div>
          ) : playing && startAt !== null ? (
            twitchLogin ? (
              twitchParent && (
                <iframe
                  src={`https://player.twitch.tv/?${p.twitchVodId ? `video=v${encodeURIComponent(p.twitchVodId)}` : `channel=${encodeURIComponent(twitchLogin)}`}&parent=${encodeURIComponent(twitchParent)}&autoplay=true&muted=false`}
                  title={video.title}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              )
            ) : (
              <iframe
                ref={iframeRef}
                src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1${startAt > 0 ? `&start=${Math.floor(startAt)}` : ""}`}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            )
          ) : (
            <>
              <img src={poster} alt="" onError={(e) => (e.currentTarget.src = video.thumb)} />
              <button className="go" aria-label="Play" onClick={() => setPlaying(true)}>
                <span>
                  <I.Play />
                </span>
              </button>
            </>
          )}
        </div>
        <h1>{video.title}</h1>
        <div className="wrow">
          <div className="chan">
            <ChannelLogo v={video} size={40} />
            <div>
              <div>{video.channel}</div>
              <div className="s">
                {p.isLive ? (
                  <>
                    <LiveMark inline /> · started {ago(video.publishedAt)}
                  </>
                ) : p.publishedAt ? (
                  `${twitchLogin ? "Streamed" : "Uploaded"} ${ago(video.publishedAt)}`
                ) : null}
              </div>
            </div>
          </div>
          <div className="acts">
            {!noRecording && (
              <button className="btn sec sm" aria-pressed={saved} onClick={toggle}>
                {saved ? <I.Saved /> : <I.Save />}
                {saved ? "Saved" : "Save"}
              </button>
            )}
            <button className="btn sec sm" onClick={share}>
              <I.Share />
              {copied ? "Link copied" : "Share"}
            </button>
            <a className="btn ghost sm" href={sourceHref} target="_blank" rel="noopener noreferrer">
              Open on {twitchLogin ? "Twitch" : "YouTube"}
            </a>
          </div>
        </div>
        {video.description && (
          <div className="desc">
            {open || !longDesc ? video.description : video.description.slice(0, 220).trimEnd() + "…"}
            {longDesc && (
              <div>
                <button onClick={() => setOpen((o) => !o)}>{open ? "Less" : "More"}</button>
              </div>
            )}
          </div>
        )}
      </div>
      <aside className="side">
        {more.length > 0 && (
          <>
            <h2 className="h2">More from {video.channel}</h2>
            {more.map((x) => (
              <MiniCard key={x.id} v={x} />
            ))}
          </>
        )}
        {trending.length > 0 && (
          <>
            <h2 className="h2">Trending</h2>
            {trending.map((x) => (
              <MiniCard key={x.id} v={x} />
            ))}
          </>
        )}
      </aside>
    </main>
  );
}
