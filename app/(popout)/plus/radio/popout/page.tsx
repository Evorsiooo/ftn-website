"use client";
export const runtime = "edge";
import React, { useEffect, useState } from "react";
import { IconLoader2, IconPlayerPause, IconPlayerPlay, IconVolume } from "@tabler/icons-react";
import { useSiteConfig } from "@/lib/site-config-context";
import { Button, Tag } from "@/components/ftn/ui";
import { ArtTile } from "@/components/ftn/media";
import { Waveform } from "@/components/radio/waveform";
import { COUNTDOWN_MS, useRadioPlayer } from "@/components/radio/use-radio-player";
import { useNowPlaying } from "@/components/radio/use-now-playing";
import { useMediaSession } from "@/components/radio/use-media-session";

// Compact player for a small popup window. It owns its own audio and keeps playing when the
// main FTN+ tab is closed; starting it silences the main page player (see use-radio-player).
export default function RadioPopoutPage() {
  const { streamUrl } = useSiteConfig();
  const { info, refresh } = useNowPlaying(8000);
  const { status, pendingSince, volume, setVolume, play, stop } = useRadioPlayer(streamUrl, () => refresh());
  const [artFailed, setArtFailed] = useState(false);
  const [wantedAutoplay, setWantedAutoplay] = useState(false);
  const [pendingNow, setPendingNow] = useState(() => Date.now());

  const isPlaying = status !== "idle" && status !== "error";
  const isBusy = status === "connecting" || status === "buffering" || status === "reconnecting";
  const toggle = () => (isPlaying ? stop() : play());

  useMediaSession(info, { onToggle: toggle });

  // The main page opens us with ?autoplay=1 when it was playing, handing playback over.
  useEffect(() => {
    if (!streamUrl) return;
    if (new URLSearchParams(window.location.search).get("autoplay") === "1") {
      setWantedAutoplay(true);
      play();
    }
  }, [streamUrl]);

  useEffect(() => {
    if (pendingSince === null) return;
    setPendingNow(Date.now());
    const timer = setInterval(() => setPendingNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [pendingSince]);

  useEffect(() => setArtFailed(false), [info?.artUrl]);


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
    <div className="relative flex h-screen flex-col overflow-y-auto overflow-x-hidden bg-ftn-bg text-ftn-text select-none">
      {artUrl && <img src={artUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-3xl" />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ftn-bg via-ftn-bg/60 to-ftn-bg/30" />

      <div className="relative z-10 flex min-h-full flex-1 flex-col items-center justify-center gap-3 p-4 sm:gap-4 sm:p-5">
        {info && !info.online && <Tag>Offline</Tag>}

        {/* Art scales with the window (width and height) and never disappears. */}
        <div
          className="aspect-square shrink-0"
          style={{ width: "clamp(4.5rem, min(18rem, calc(100vw - 2rem), calc(100vh - 19rem)), 18rem)" }}
        >
          <ArtTile
            src={artUrl}
            onError={() => setArtFailed(true)}
            className="h-full w-full rounded-2xl border border-ftn-line-strong shadow-2xl sm:rounded-3xl"
          />
        </div>

        <div className="w-full space-y-1 text-center">
          <h1 className="ftn-display text-xl leading-tight line-clamp-2 sm:text-2xl">{title}</h1>
          <p className="text-sm text-ftn-text-2 line-clamp-1">{subtitle}</p>
        </div>

        <Waveform playing={status === "playing"} className="mx-auto h-5 [@media(max-height:30rem)]:hidden" />

        <div className="flex flex-col items-center gap-3">
          <Button onClick={toggle} disabled={!streamUrl} size="lg" aria-busy={isBusy} className="w-full max-w-[18rem] [@media(max-height:30rem)]:h-11">
            {isBusy ? (
              <IconLoader2 className="h-5 w-5 animate-spin" />
            ) : isPlaying ? (
              <IconPlayerPause className="h-5 w-5 fill-current" />
            ) : (
              <IconPlayerPlay className="h-5 w-5 fill-current" />
            )}
            <span className="tabular-nums">{label}</span>
          </Button>
          <div className="flex w-full max-w-[18rem] items-center gap-3 rounded-full border border-ftn-line-strong bg-ftn-surface-2 px-5 h-11">
            <IconVolume className="h-4 w-4 text-ftn-text-2" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              style={{ "--fill": `${volume * 100}%` } as React.CSSProperties}
              className="ftn-range w-full"
            />
          </div>
          {wantedAutoplay && status === "idle" && (
            <p className="text-xs text-ftn-text-3 text-center">Your browser blocked autoplay. Press Listen live to continue.</p>
          )}
          {status === "error" && <p className="text-xs text-red-400 text-center">The stream stopped responding.</p>}
        </div>
      </div>
    </div>
  );
}
