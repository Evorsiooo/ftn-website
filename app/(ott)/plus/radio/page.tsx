"use client";
export const runtime = "edge";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconRadio,
  IconBrandDiscord,
  IconCopy,
  IconCheck,
  IconHeadphones,
  IconVolume,
} from "@tabler/icons-react";
import { useSiteConfig } from "@/lib/site-config-context";
import { RadioLane, RadioCard } from "@/components/radio/radio-lane";

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

interface ScheduleEntry {
  slotId: string;
  tag: "live" | "simulcast" | "rebroadcast";
  start: string;
  end: string;
  show: { id: string; name: string; presenter: string; description: string | null; artUrl: string | null };
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });

function untilLabel(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function EqualizerBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-5" aria-hidden>
      {[0.5, 1, 0.7, 0.9, 0.4].map((peak, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-[#FFBB14]"
          animate={active ? { height: ["20%", `${peak * 100}%`, "30%", `${peak * 85}%`, "20%"] } : { height: "20%" }}
          transition={active ? { duration: 1 + i * 0.15, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
}

export default function FTNPlusRadioPage() {
  const { streamUrl, webradioEnabled } = useSiteConfig();
  const [info, setInfo] = useState<NowPlaying | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [copied, setCopied] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
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
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [refresh]);

  useEffect(() => {
    fetch("/api/radio/schedule")
      .then((res) => res.json())
      .then((data: any) => setSchedule(Array.isArray(data?.schedule) ? data.schedule : []))
      .catch(() => setSchedule([]));
  }, []);

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
    if (isPlaying) {
      audioRef.current?.pause();
      // Drop the buffered stream so resuming jumps back to live.
      if (audioRef.current) audioRef.current.src = "";
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }
    const audio = new Audio(streamUrl);
    audio.volume = volume;
    audioRef.current = audio;
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
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
          <IconRadio className="h-10 w-10 text-[#FFBB14] mx-auto" />
          <h1 className="text-2xl font-black text-white">Webradio is offline</h1>
          <p className="text-xs text-neutral-400">The FTN webradio is currently switched off. Check back soon.</p>
        </div>
      </div>
    );
  }

  const show = info?.currentShow || null;
  const artUrl = info?.artUrl && !artFailed ? info.artUrl : null;
  const isAuto = !show;
  const track = info?.track || null;
  const headline = show ? show.name : track ? track.title : info?.stationName || "FTN Radio";
  const subline = show
    ? `with ${show.presenter}`
    : track
      ? track.artist || "Unknown artist"
      : info && !info.online
        ? "The stream is offline right now"
        : "Non-stop music on FTN Radio";
  const nextShow = info?.nextShow || null;

  // Progress through the current show
  let progress = 0;
  if (show) {
    const start = new Date(show.start).getTime();
    const end = new Date(show.end).getTime();
    progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }

  const shows = new Map<string, ScheduleEntry["show"]>();
  schedule?.forEach((e) => shows.set(e.show.id, e.show));

  return (
    <div className="min-h-screen bg-neutral-950 pb-20 text-white">
      {/* HERO: cinematic backdrop built from the current art, same treatment as the FTN+ billboard */}
      <div className="relative w-full min-h-[60vh] overflow-hidden select-none">
        <AnimatePresence>
          <motion.div
            key={artUrl || "no-art"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute inset-0"
          >
            {artUrl ? (
              <img src={artUrl} alt="" className="h-full w-full object-cover scale-125 blur-3xl opacity-60" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-neutral-900 via-neutral-950 to-black" />
            )}
          </motion.div>
        </AnimatePresence>
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-[#FFBB14]/15 blur-3xl animate-pulse" />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/60 to-transparent w-full md:w-3/4" />

        <div className="relative z-10 min-h-[60vh] flex flex-col md:flex-row items-start md:items-end justify-between gap-10 px-6 md:px-12 pt-20 pb-14">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-3xl space-y-4"
          >
            <div className="flex flex-wrap items-center gap-3">
              {info?.online ? (
                <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                  LIVE
                </span>
              ) : (
                <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Offline
                </span>
              )}
              <span className="text-xs font-semibold uppercase tracking-widest text-[#FFBB14]">
                {isAuto && info?.online ? "AutoDJ" : info?.stationName || "FTN Radio"}
              </span>
              {show && show.tag !== "live" && (
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{show.tag}</span>
              )}
              {info?.listeners !== null && info?.listeners !== undefined && info.listeners >= 2 && (
                <span className="inline-flex items-center gap-1 text-xs text-neutral-300">
                  <IconHeadphones className="h-4 w-4" /> {info.listeners} listening
                </span>
              )}
            </div>

            {isAuto && track && (
              <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                <EqualizerBars active={isPlaying} /> Now playing
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${headline}|${subline}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35 }}
                className="space-y-3"
              >
                <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-tight drop-shadow-md">
                  {headline}
                </h1>
                <p className="text-sm sm:text-lg text-neutral-300 leading-relaxed max-w-2xl drop-shadow">{subline}</p>
              </motion.div>
            </AnimatePresence>
            {show?.description && (
              <p className="text-sm text-neutral-400 line-clamp-2 max-w-2xl">{show.description}</p>
            )}

            {show && info?.track && (
              <div className="flex items-center gap-3 text-xs text-neutral-300">
                <EqualizerBars active={isPlaying} />
                <span>
                  Now playing: <span className="font-semibold text-white">{info.track.title}</span>
                  {info.track.artist ? ` · ${info.track.artist}` : ""}
                </span>
              </div>
            )}

            {show && (
              <div className="max-w-md space-y-1.5">
                <div className="h-[3px] w-full rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full bg-[#FFBB14] shadow-[0_0_10px_#FFBB14] transition-all duration-1000"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-mono text-neutral-400">
                  <span>{timeFmt.format(new Date(show.start))}</span>
                  <span>On air until {timeFmt.format(new Date(show.end))}</span>
                </div>
              </div>
            )}

            {isAuto && nextShow && (
              <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/70 backdrop-blur-sm p-2.5 pr-4 max-w-md">
                {nextShow.artUrl ? (
                  <img src={nextShow.artUrl} alt="" className="h-12 w-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-neutral-800 flex-shrink-0 flex items-center justify-center">
                    <IconRadio className="h-5 w-5 text-[#FFBB14]" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#FFBB14]">
                    Up next · in {untilLabel(new Date(nextShow.start).getTime() - now)}
                  </div>
                  <div className="text-sm font-bold text-white truncate">{nextShow.name}</div>
                  <div className="text-[11px] text-neutral-400 truncate">
                    with {nextShow.presenter} · {dayFmt.format(new Date(nextShow.start))}{" "}
                    {timeFmt.format(new Date(nextShow.start))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={togglePlay}
                disabled={!info?.online}
                className="gap-2 font-black px-7 h-12 text-sm rounded-lg bg-[#FFBB14] hover:bg-[#e5a710] disabled:opacity-40 disabled:cursor-not-allowed text-black shadow-[0px_2px_0px_0px_#FFFFFF40_inset] flex items-center justify-center transition duration-200 cursor-pointer"
              >
                {isPlaying ? (
                  <IconPlayerPause className="h-5 w-5 fill-current" />
                ) : (
                  <IconPlayerPlay className="h-5 w-5 fill-current" />
                )}
                {isPlaying ? "Pause" : "Listen Live"}
              </button>
              <div className="flex items-center gap-2 rounded-lg bg-neutral-900/80 border border-neutral-800 h-12 px-4 backdrop-blur-sm">
                <IconVolume className="h-4 w-4 text-neutral-400" />
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
              {info?.discordBot.link && (
                <button
                  type="button"
                  onClick={() => document.getElementById("radio-discord")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  className="gap-2 h-12 px-4 rounded-lg bg-neutral-900/80 border border-neutral-800 hover:bg-neutral-800 text-neutral-200 text-xs font-semibold flex items-center transition cursor-pointer backdrop-blur-sm"
                >
                  <IconBrandDiscord className="h-4 w-4 text-[#FFBB14]" /> Listen in Discord
                </button>
              )}
            </div>
          </motion.div>

          {/* Cover art */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="relative flex-shrink-0 self-center md:self-end"
          >
            <div
              className={`absolute -inset-3 rounded-3xl bg-[#FFBB14]/30 blur-2xl transition-opacity duration-700 ${
                isPlaying ? "opacity-100 animate-pulse" : "opacity-30"
              }`}
            />
            <div className="relative h-56 w-56 sm:h-72 sm:w-72 overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl flex items-center justify-center">
              <AnimatePresence mode="wait">
                {artUrl ? (
                  <motion.img
                    key={artUrl}
                    src={artUrl}
                    alt=""
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="h-full w-full object-cover"
                    onError={() => setArtFailed(true)}
                  />
                ) : (
                  <motion.img
                    key="logo"
                    src="/logos/ftnplus_favicon.png"
                    alt=""
                    className="h-20 w-20 object-contain opacity-70"
                  />
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>

      {/* LANES */}
      <div className="relative z-20 -mt-8 space-y-6">
        {schedule === null ? (
          <div className="px-6 md:px-12 text-xs text-neutral-500">Loading schedule...</div>
        ) : schedule.length === 0 ? (
          <div className="px-6 md:px-12 text-sm text-neutral-400">
            No shows are scheduled yet. Check back soon.
          </div>
        ) : (
          <>
            <RadioLane title="Coming Up">
              {schedule.map((entry, i) => {
                const start = new Date(entry.start);
                const isNow = start.getTime() <= now && new Date(entry.end).getTime() > now;
                return (
                  <RadioCard
                    key={`${entry.slotId}-${entry.start}`}
                    title={entry.show.name}
                    presenter={entry.show.presenter}
                    artUrl={entry.show.artUrl}
                    badge={isNow ? "On air" : i === (schedule.findIndex((e) => new Date(e.start).getTime() > now)) ? "Up next" : undefined}
                    badgeTone={isNow ? "live" : "neutral"}
                    timeLabel={`${dayFmt.format(start)} ${timeFmt.format(start)} – ${timeFmt.format(new Date(entry.end))}`}
                    tag={entry.tag}
                  />
                );
              })}
            </RadioLane>

            {shows.size > 0 && (
              <RadioLane title="The Shows">
                {Array.from(shows.values()).map((s) => (
                  <RadioCard key={s.id} title={s.name} presenter={s.presenter} artUrl={s.artUrl} />
                ))}
              </RadioLane>
            )}
          </>
        )}

        {info?.discordBot.link && (
          <div id="radio-discord" className="px-6 md:px-12 pt-4">
            <div className="relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="absolute -left-10 -top-10 h-48 w-48 rounded-full bg-[#FFBB14]/10 blur-3xl" />
              <div className="relative space-y-2 max-w-xl">
                <div className="flex items-center gap-2 text-xl font-bold tracking-tight">
                  <IconBrandDiscord className="h-6 w-6 text-[#FFBB14]" /> Take FTN Radio to your Discord
                </div>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Invite the radio bot to your server, then run the setup command from the voice channel you are in.
                </p>
              </div>
              <div className="relative flex flex-col sm:flex-row gap-3 md:items-center">
                <button
                  type="button"
                  onClick={copyCommand}
                  className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-black px-4 h-12 text-left cursor-pointer hover:border-neutral-700 transition"
                >
                  <code className="text-sm font-mono text-white">{info.discordBot.command}</code>
                  {copied ? (
                    <IconCheck className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <IconCopy className="h-4 w-4 text-neutral-400" />
                  )}
                </button>
                <a
                  href={info.discordBot.link}
                  target="_blank"
                  rel="noreferrer"
                  className="gap-2 font-black px-7 h-12 text-sm rounded-lg bg-[#FFBB14] hover:bg-[#e5a710] text-black shadow-[0px_2px_0px_0px_#FFFFFF40_inset] flex items-center justify-center transition duration-200"
                >
                  Invite the Bot
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
