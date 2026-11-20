"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useSiteConfig } from "@/lib/site-config-context";
import { useRadioPlayer } from "./use-radio-player";
import { useRadioSource } from "./use-radio-source";
import { useNowPlaying, type NowPlaying } from "./use-now-playing";
import { useMediaSession } from "./use-media-session";
import { useRadioProgram } from "./use-radio-program";
import { useStudioVoices } from "./use-studio-voices";
import { useOwnVoiceIds } from "./own-voice";
import type { ProgramAiring, RadioProgram } from "@/lib/radio/program-types";
import { FullScreen, PlayerBar } from "@/components/plus/radio-ui";

type RadioPlayer = ReturnType<typeof useRadioPlayer>;
export interface RadioContextValue extends RadioPlayer {
  streamUrl: string;
  /** What is on air. Only polled while the mini player is on screen. */
  info: NowPlaying | null;
  /** Radio has been started in this tab (or by another window) and the mini player may show. */
  sessionActive: boolean;
  /** The player bar is on screen (pages leave room for it). */
  barShown: boolean;
  /** Stops and closes the player bar. */
  dismissMini: () => void;
  /** The radio in full screen (opened from the bar or the radio page). */
  full: boolean;
  setFull: (on: boolean) => void;
  /** Moves the radio to a small window of its own: playback carries on there and stops here. */
  popout: () => void;
  /** Shows and the Studio show on air (radio/program.json). */
  program: RadioProgram | null;
  /** The scheduled airing on now, if any. */
  airing: ProgramAiring | null;
  /** This browser is on air (Studio or calling in): its own voice isn't played back to it. */
  setOwnVoice: (v: { id: string; mic: MediaStream } | null) => void;
  /** Why the show's voices can't be heard (usage cap, connection), or null. */
  voiceError: string | null;
  /** The people on air talking right now (their ids in program.studio.voices). */
  speaking: string[];
}

const RadioContext = createContext<RadioContextValue | null>(null);

export function useRadio(): RadioContextValue {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error("useRadio must be used inside <RadioProvider>");
  return ctx;
}

// The radio page is the player itself, so the bar stays hidden there (and in the popout under it).
const HIDDEN_ON = ["/plus/radio", "/api"];

/**
 * Owns the one <audio> for the webradio. It lives in the root layout, so playback carries on
 * through every client-side navigation, FTN+ and the main site alike.
 */
export function RadioProvider({ children }: { children: React.ReactNode }) {
  const { streamUrl, webradioEnabled } = useSiteConfig();
  const pathname = usePathname() || "/";
  const isPopout = pathname.startsWith("/plus/radio/popout");
  const [started, setStarted] = useState(false);
  // checked once the radio has been started here, and on the radio pages
  const watching = webradioEnabled && (started || pathname.startsWith("/plus/radio") || pathname.startsWith("/admin/radio") || pathname.startsWith("/admin/schedule/studio"));
  const icecast = useRadioSource(watching);
  const { program, airing } = useRadioProgram(watching);
  // an OBS show on Icecast wins; then a scheduled stream show; otherwise the AutoDJ (with any Studio show)
  const showStream = airing?.plays === "stream" && airing.stream ? airing.stream : null;
  const source = icecast === "icecast" ? "icecast" : showStream ? "stream" : "autodj";
  const player = useRadioPlayer(source === "stream" ? showStream! : streamUrl, undefined, { takeOver: isPopout, source });
  const [own, setOwn] = useState<{ id: string; mic: MediaStream } | null>(null);
  const playingHere = player.localStatus === "playing" || player.localStatus === "buffering";
  // on air in this tab, or in another tab of this browser (the Studio open beside FTN+ or the popout)
  const otherTabsOwn = useOwnVoiceIds();
  const ownVoiceIds = useMemo(() => [...new Set([...(own ? [own.id] : []), ...otherTabsOwn])], [own, otherTabsOwn]);
  const { error: voiceError, speaking } = useStudioVoices({
    program,
    active: source === "autodj" && playingHere,
    volume: player.volume,
    muted: player.muted,
    ownVoiceId: own?.id ?? null,
    ownVoiceIds,
    ownMic: own?.mic ?? null,
    voiceDuck: player.voiceDuck,
  });
  const [dismissed, setDismissed] = useState(false);
  const [full, setFull] = useState(false);

  const live = player.status !== "idle" && player.status !== "error";
  useEffect(() => {
    if (live) {
      setStarted(true);
      setDismissed(false);
    }
  }, [live]);

  const hiddenHere = HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const sessionActive = webradioEnabled && started && !dismissed;
  const showMini = sessionActive && !hiddenHere;
  // Poll what is on air only while something is shown or playing; the radio page does its own.
  const { info: polled } = useNowPlaying(10000, showMini);
  // On the AutoDJ the song comes from this browser's own player; the schedule's shows still come from the poll.
  const info = useMemo<NowPlaying | null>(() => {
    if (player.source !== "autodj" || !polled) return polled;
    return { ...polled, online: true, track: player.song ? { artist: player.song.artist, title: player.song.title } : null, listeners: player.listeners };
  }, [polled, player.source, player.song, player.listeners]);

  // Lock-screen and media-key controls follow whichever window is actually playing.
  // (Pages with their own full player register their own handlers.)
  useMediaSession(showMini ? info : null, {
    onToggle: showMini ? () => (live ? player.stop() : player.play()) : undefined,
  });

  // The mini player lifts other bottom-anchored UI (see PlusMiniBar) out of its way.
  useEffect(() => {
    const el = document.documentElement;
    if (showMini) el.setAttribute("data-radio-mini", "");
    else el.removeAttribute("data-radio-mini");
    return () => {
      el.removeAttribute("data-radio-mini");
    };
  }, [showMini]);

  const value = useMemo<RadioContextValue>(
    () => ({
      ...player,
      streamUrl,
      info,
      sessionActive,
      barShown: showMini,
      dismissMini: () => {
        if (live) player.stop();
        setDismissed(true);
      },
      full,
      setFull,
      program,
      airing,
      setOwnVoice: setOwn,
      voiceError,
      speaking,
      popout: () => {
        const wasPlaying = player.localStatus === "playing" || player.localStatus === "buffering" || player.localStatus === "connecting";
        if (live) player.stop();
        window.open(`/plus/radio/popout${wasPlaying ? "?autoplay=1" : ""}`, "ftnplus-radio", "width=380,height=640");
        setFull(false);
        setDismissed(true);
      },
    }),
    [player.status, player.localStatus, player.remotePlaying, player.pendingSince, player.volume, player.muted, player.source, player.song, player.listeners, player.ducked, streamUrl, info, sessionActive, showMini, live, full, program, airing, voiceError, speaking.join(",")]
  );

  return (
    <RadioContext.Provider value={value}>
      {children}
      {(showMini || full) && (
        <div className={`fp fp-lite${pathname.startsWith("/plus") ? "" : " fp-site"}`}>
          {showMini && <PlayerBar />}
          {full && <FullScreen />}
        </div>
      )}
    </RadioContext.Provider>
  );
}
