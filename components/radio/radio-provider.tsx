"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useSiteConfig } from "@/lib/site-config-context";
import { useRadioPlayer } from "./use-radio-player";
import { useRadioSource } from "./use-radio-source";
import { useNowPlaying, type NowPlaying } from "./use-now-playing";
import { useMediaSession } from "./use-media-session";
import { RadioMiniPlayer } from "./radio-mini-player";

type RadioPlayer = ReturnType<typeof useRadioPlayer>;
export interface RadioContextValue extends RadioPlayer {
  streamUrl: string;
  /** What is on air. Only polled while the mini player is on screen. */
  info: NowPlaying | null;
  /** Radio has been started in this tab (or by another window) and the mini player may show. */
  sessionActive: boolean;
  dismissMini: () => void;
}

const RadioContext = createContext<RadioContextValue | null>(null);

export function useRadio(): RadioContextValue {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error("useRadio must be used inside <RadioProvider>");
  return ctx;
}

// Pages that have their own full player, or where a floating one would be in the way.
const HIDDEN_ON = ["/plus/radio", "/plus/watch", "/api"];

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
  const source = useRadioSource(webradioEnabled && (started || pathname.startsWith("/plus/radio")));
  const player = useRadioPlayer(streamUrl, undefined, { takeOver: isPopout, source });
  const [dismissed, setDismissed] = useState(false);

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
      dismissMini: () => {
        if (live) player.stop();
        setDismissed(true);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [player.status, player.localStatus, player.remotePlaying, player.pendingSince, player.volume, player.muted, player.source, player.song, player.listeners, player.ducked, streamUrl, info, sessionActive, live]
  );

  return (
    <RadioContext.Provider value={value}>
      {children}
      {showMini && <RadioMiniPlayer />}
    </RadioContext.Provider>
  );
}
