"use client";
export const runtime = "edge";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Radio, Volume2, Copy, Check, Bot, Users } from "lucide-react";
import { useSiteConfig } from "@/lib/site-config-context";
import { ScheduleList } from "@/components/radio/schedule-list";

interface ShowInfo {
  name: string;
  presenter: string;
  description: string | null;
  artUrl: string | null;
  tag: "live" | "simulcast" | "rebroadcast";
  start: string;
  end: string;
}

interface NowPlaying {
  online: boolean;
  stationName: string;
  discordBot: { link: string; command: string };
  track: { artist: string; title: string } | null;
  listeners: number | null;
  artUrl: string | null;
  currentShow: ShowInfo | null;
  nextShow: ShowInfo | null;
}

export default function FTNPlusRadioPage() {
  const { streamUrl, webradioEnabled } = useSiteConfig();
  const [info, setInfo] = useState<NowPlaying | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [copied, setCopied] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/radio/now-playing")
      .then((res) => res.json())
      .then((data) => setInfo(data as NowPlaying))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Playback belongs to this page: stop the stream when leaving it.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    setArtFailed(false);
  }, [info?.artUrl]);

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(streamUrl);
      audioRef.current.volume = volume;
    }
    const audio = audioRef.current;
    if (isPlaying) {
      audio.pause();
      // Drop the buffered stream so resuming jumps back to live.
      audio.src = "";
      audioRef.current = null;
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const changeVolume = (value: number) => {
    setVolume(value);
    if (audioRef.current) audioRef.current.volume = value;
  };

  const copyCommand = () => {
    if (!info?.discordBot.command) return;
    navigator.clipboard
      .writeText(info.discordBot.command)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  if (!webradioEnabled) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-8 text-center">
        <div className="space-y-3 max-w-md">
          <Radio className="h-10 w-10 text-[#FFBB14] mx-auto" />
          <h1 className="text-2xl font-black text-white">Webradio is offline</h1>
          <p className="text-xs text-neutral-400">The FTN webradio is currently switched off. Check back soon.</p>
        </div>
      </div>
    );
  }

  const show = info?.currentShow;
  const headline = show ? show.name : info?.track ? info.track.title : "FTN Radio";
  const subline = show
    ? `with ${show.presenter}`
    : info?.track
      ? info.track.artist
      : info && !info.online
        ? "Stream is offline right now"
        : "Playing continuous music";

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-20">
      <div className="relative overflow-hidden bg-gradient-to-br from-neutral-900 to-black border-b border-neutral-800">
        <div className="mx-auto max-w-5xl px-4 sm:px-8 py-10 sm:py-14 flex flex-col sm:flex-row gap-8 items-center">
          <div className="h-56 w-56 sm:h-64 sm:w-64 flex-shrink-0 rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 flex items-center justify-center shadow-2xl">
            {info?.artUrl && !artFailed ? (
              <img
                src={info.artUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setArtFailed(true)}
              />
            ) : (
              <Radio className="h-16 w-16 text-[#FFBB14]" />
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-4 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                  info?.online ? "bg-red-600 text-white" : "bg-neutral-800 text-neutral-400"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${info?.online ? "bg-white animate-pulse" : "bg-neutral-500"}`} />
                {info?.online ? "On air" : "Offline"}
              </span>
              {show && show.tag !== "live" && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{show.tag}</span>
              )}
              {info?.listeners !== null && info?.listeners !== undefined && (
                <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
                  <Users className="h-3.5 w-3.5" /> {info.listeners}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight truncate">{headline}</h1>
              <p className="text-sm text-neutral-400">{subline}</p>
              {show && info?.track && (
                <p className="text-xs text-neutral-500">
                  Now playing: {info.track.artist ? `${info.track.artist} – ` : ""}
                  {info.track.title}
                </p>
              )}
            </div>

            <div className="flex items-center justify-center sm:justify-start gap-4">
              <button
                onClick={togglePlay}
                disabled={!info?.online}
                className="h-12 px-6 inline-flex items-center gap-2 rounded-full bg-[#FFBB14] hover:bg-[#e5a710] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold transition cursor-pointer"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPlaying ? "Pause" : "Listen live"}
              </button>
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-neutral-400" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  aria-label="Volume"
                  className="w-24 accent-[#FFBB14]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-8 pt-10 grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-black">Schedule</h2>
          <ScheduleList />
        </div>

        <div className="space-y-6">
          {info?.nextShow && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Up next</div>
              <div className="text-sm font-bold">{info.nextShow.name}</div>
              <div className="text-xs text-neutral-400">with {info.nextShow.presenter}</div>
              <div className="text-xs font-mono text-[#FFBB14]">
                {new Date(info.nextShow.start).toLocaleString(undefined, {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          )}

          {info?.discordBot.link && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold">
                <Bot className="h-4 w-4 text-[#FFBB14]" /> Listen in Discord
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Invite the radio bot to your server, then run this command from the voice channel you are in.
              </p>
              <button
                type="button"
                onClick={copyCommand}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-black px-3 py-2 text-left cursor-pointer hover:border-neutral-700 transition"
              >
                <code className="text-xs font-mono text-white truncate">{info.discordBot.command}</code>
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-neutral-400" />}
              </button>
              <a
                href={info.discordBot.link}
                target="_blank"
                rel="noreferrer"
                className="block w-full text-center rounded-lg bg-[#FFBB14] hover:bg-[#e5a710] text-black text-xs font-bold py-2.5 transition"
              >
                Invite the bot
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
