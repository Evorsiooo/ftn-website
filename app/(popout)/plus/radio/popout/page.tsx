"use client";
export const runtime = "edge";
import React, { useEffect, useState } from "react";
import { IconLoader2, IconPlayerPause, IconPlayerPlay, IconVolume, IconVolume3 } from "@tabler/icons-react";
import { Button } from "@/components/ftn/ui";
import { ArtTile } from "@/components/ftn/media";
import { Crossfade } from "@/components/radio/crossfade";
import { COUNTDOWN_MS } from "@/components/radio/use-radio-player";
import { useRadio } from "@/components/radio/radio-provider";
import { useNowPlaying } from "@/components/radio/use-now-playing";
import { useMediaSession } from "@/components/radio/use-media-session";

// Compact player for a small popup window. It owns its own audio and keeps playing when the
// main FTN+ tab is closed; starting it silences the main page player (see use-radio-player).
export default function RadioPopoutPage() {
  const { info, refresh } = useNowPlaying(8000);
  const { streamUrl, status, pendingSince, volume, muted, setVolume, toggleMute, play, stop } = useRadio();
  useEffect(() => {
    if (status === "playing") refresh();
  }, [status, refresh]);
  const [artFailed, setArtFailed] = useState(false);
  const [wantedAutoplay, setWantedAutoplay] = useState(false);
  const [pendingNow, setPendingNow] = useState(() => Date.now());

  const isPlaying = status !== "idle" && status !== "error";
  const isBusy = status === "connecting" || status === "buffering" || status === "reconnecting";
  const toggle = () => (isPlaying ? stop() : play());

  useMediaSession(info, { onToggle: toggle });
  const shownVolume = muted ? 0 : volume;

  // The main page opens us with ?autoplay=1 when it was playing. We start our own stream and
  // the main page fades out once we are really playing, so the music carries on.
  useEffect(() => {
    if (!streamUrl) return;
    if (new URLSearchParams(window.location.search).get("autoplay") === "1") {
      setWantedAutoplay(true);
      play({ handoff: true });
    }
  }, [streamUrl]);

  useEffect(() => {
    if (pendingSince === null) return;
    setPendingNow(Date.now());
    const timer = setInterval(() => setPendingNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [pendingSince]);

  useEffect(() => setArtFailed(false), [info?.artUrl]);

  // The window is the whole UI: no scrollbar and no reserved gutter painted grey beside it.
  useEffect(() => {
    const html = document.documentElement;
    const prev = { gutter: html.style.scrollbarGutter, overflow: html.style.overflow };
    html.style.scrollbarGutter = "auto";
    html.style.overflow = "hidden";
    return () => {
      html.style.scrollbarGutter = prev.gutter;
      html.style.overflow = prev.overflow;
    };
  }, []);


  const show = info?.currentShow || null;
  const artUrl = info?.artUrl && !artFailed ? info.artUrl : null;
  const title = show ? show.name : info?.track?.title || info?.stationName || "FTN Radio";
  const subtitle = show
    ? `with ${show.presenter}`
    : info?.track
      ? info.track.artist || "Unknown artist"
      : info && !info.online
        ? "The stream is offline right now"
        : "Non-stop music on FTN Radio";

  useEffect(() => {
    document.title = info?.track && !show ? `${title} · ${subtitle}` : title;
  }, [info?.track, show, title, subtitle]);

  const countdownLeft = pendingSince === null ? 0 : Math.max(0, COUNTDOWN_MS - (pendingNow - pendingSince));
  const label = isBusy
    ? status !== "buffering" && countdownLeft > 0
      ? `Buffering… ${(countdownLeft / 1000).toFixed(1)}s`
      : status === "reconnecting" && pendingSince === null
        ? "Reconnecting…"
        : "Buffering…"
    : isPlaying
      ? "Pause"
      : status === "error"
        ? "Try again"
        : "Listen live";

  return (
    <div className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-ftn-bg text-ftn-text select-none">
      <Crossfade id={artUrl || "no-art"} duration={1.4} className="pointer-events-none absolute inset-0">
        {artUrl ? <img src={artUrl} alt="" className="h-full w-full scale-125 object-cover opacity-30 blur-3xl" /> : <div className="h-full w-full" />}
      </Crossfade>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ftn-bg via-ftn-bg/60 to-ftn-bg/30" />

      {/*
        Shrinks in a fixed order as the window gets shorter: the art scales down and is the first
        thing to go, then the subtitle, then the controls fold into one row. The play button and
        the volume are always there.
      */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 [@media(max-height:19rem)]:gap-2 [@media(max-height:19rem)]:p-3 [@media(max-height:10rem)]:gap-1 [@media(max-height:10rem)]:p-2">
        {/* Art: takes whatever height is left, square, and disappears first. */}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center [@media(max-height:19rem)]:hidden">
          <Crossfade
            id={artUrl || "no-art"}
            zoom
            className="aspect-square max-h-full max-w-[18rem] min-h-0 min-w-0 flex-1 basis-0 rounded-3xl border border-ftn-line-strong shadow-2xl [@media(max-height:26rem)]:rounded-2xl"
          >
            <ArtTile src={artUrl} onError={() => setArtFailed(true)} className="h-full w-full" />
          </Crossfade>
        </div>

        <div className="w-full min-w-0 flex-none space-y-1 text-center [@media(max-height:10rem)]:space-y-0 [@media(max-height:6.5rem)]:hidden">
          {info && !info.online && <span className="block text-[11px] font-semibold text-ftn-text-3">Offline</span>}
          <h1 className="ftn-display line-clamp-2 text-xl leading-tight [@media(max-height:19rem)]:line-clamp-1 [@media(max-height:19rem)]:text-base [@media(max-height:10rem)]:text-sm">
            {title}
          </h1>
          <p className="line-clamp-1 text-sm text-ftn-text-2 [@media(max-height:14.5rem)]:hidden">{subtitle}</p>
        </div>

        {/* Controls: stacked while there is room, one row once the window is short. */}
        <div className="flex w-full max-w-[18rem] flex-none flex-col items-stretch gap-3 [@media(max-height:14.5rem)]:max-w-none [@media(max-height:14.5rem)]:flex-row [@media(max-height:14.5rem)]:items-center [@media(max-height:14.5rem)]:gap-2">
          <Button
            onClick={toggle}
            disabled={!streamUrl}
            size="lg"
            aria-busy={isBusy}
            aria-label={label}
            className="w-full [@media(max-height:14.5rem)]:h-10 [@media(max-height:14.5rem)]:w-10 [@media(max-height:14.5rem)]:flex-none [@media(max-height:14.5rem)]:px-0 [@media(max-height:30rem)]:h-11"
          >
            {isBusy ? (
              <IconLoader2 className="h-5 w-5 animate-spin" />
            ) : isPlaying ? (
              <IconPlayerPause className="h-5 w-5 fill-current" />
            ) : (
              <IconPlayerPlay className="h-5 w-5 fill-current" />
            )}
            <span className="tabular-nums [@media(max-height:14.5rem)]:hidden">{label}</span>
          </Button>
          <div className="flex h-11 min-w-0 flex-none items-center [@media(max-height:14.5rem)]:flex-1 gap-2 rounded-full border border-ftn-line-strong bg-ftn-surface-2 pl-3 pr-4 [@media(max-height:14.5rem)]:h-10">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="grid h-6 w-6 flex-none cursor-pointer place-items-center text-ftn-text-2 transition hover:text-ftn-text"
            >
              {shownVolume === 0 ? <IconVolume3 className="h-4 w-4" /> : <IconVolume className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={shownVolume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              style={{ "--fill": `${shownVolume * 100}%` } as React.CSSProperties}
              className="ftn-range min-w-0 flex-1"
            />
          </div>
        </div>
        {wantedAutoplay && status === "idle" && (
          <p className="text-center text-xs text-ftn-text-3 [@media(max-height:19rem)]:hidden">Your browser blocked autoplay. Press Listen live to continue.</p>
        )}
        {status === "error" && <p className="text-center text-xs text-red-400 [@media(max-height:19rem)]:hidden">The stream stopped responding.</p>}
      </div>
    </div>
  );
}
