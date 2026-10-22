"use client";
import { useEffect } from "react";
import type { NowPlaying } from "@/components/radio/use-now-playing";

// Lock-screen / media key metadata for the radio.
export function useMediaSession(info: NowPlaying | null, opts?: { onToggle?: () => void }) {
  const title = info?.currentShow?.name || info?.track?.title || info?.stationName || "FTN Radio";
  const artist = info?.currentShow ? `with ${info.currentShow.presenter}` : info?.track?.artist || info?.stationName || "FTN Radio";
  const art = info?.artUrl || null;
  const onToggle = opts?.onToggle;

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: info?.stationName || "FTN Radio",
      artwork: art ? [{ src: art, sizes: "512x512" }] : [],
    });
  }, [title, artist, art, info?.stationName]);

  useEffect(() => {
    if (!onToggle || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler("play", onToggle);
      navigator.mediaSession.setActionHandler("pause", onToggle);
    } catch {}
    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
      } catch {}
    };
  }, [onToggle]);
}
