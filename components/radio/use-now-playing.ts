"use client";
import { useCallback, useEffect, useState } from "react";
import { decodeEntities } from "@/lib/html-entities";

export interface ShowInfo {
  name: string;
  presenter: string;
  description: string | null;
  artUrl: string | null;
  tag: "live" | "simulcast" | "rebroadcast";
  start: string;
  end: string;
}

export interface NowPlaying {
  online: boolean;
  stationName: string;
  discordBot: { link: string; command: string };
  track: { artist: string; title: string } | null;
  listeners: number | null;
  artUrl: string | null;
  currentShow: ShowInfo | null;
  nextShow: ShowInfo | null;
}


const clean = (info: NowPlaying): NowPlaying =>
  info.track
    ? { ...info, track: { artist: decodeEntities(info.track.artist), title: decodeEntities(info.track.title) } }
    : info;

// Polls what is on air. The shown value only changes once new art has loaded, so the title
// and the cover switch together instead of the art lagging behind the text.
export function useNowPlaying(intervalMs = 10000) {
  const [latest, setLatest] = useState<NowPlaying | null>(null);
  const [info, setInfo] = useState<NowPlaying | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/radio/now-playing")
      .then((res) => res.json())
      .then((data) => setLatest(clean(data as NowPlaying)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  useEffect(() => {
    if (!latest) return;
    const commit = () => setInfo(latest);
    const artChanged = info && latest.artUrl && latest.artUrl !== info.artUrl;
    if (!artChanged) return commit();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      commit();
    };
    const img = new Image();
    img.onload = finish;
    img.onerror = finish;
    img.src = latest.artUrl!;
    const timer = setTimeout(finish, 3000);
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, [latest]);

  return { info, refresh };
}
