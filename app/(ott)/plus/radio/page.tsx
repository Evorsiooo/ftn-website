"use client";
export const runtime = "edge";
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconRadio,
  IconBrandDiscord,
  IconCopy,
  IconCheck,
  IconHeadphones,
  IconVolume,
  IconLoader2,
  IconAlertTriangle,
  IconExternalLink,
  IconMusic,
} from "@tabler/icons-react";
import { useSiteConfig } from "@/lib/site-config-context";
import { PageShell } from "@/components/ftn/page";
import { Button, EmptyState, GUTTER, ProgressBar, Tag } from "@/components/ftn/ui";
import { ArtTile, Lane, LaneSkeleton, MediaCard } from "@/components/ftn/media";
import { cn } from "@/lib/utils";
import { useNowPlaying } from "@/components/radio/use-now-playing";
import { useMediaSession } from "@/components/radio/use-media-session";
import { COUNTDOWN_MS, useRadioPlayer } from "@/components/radio/use-radio-player";
import { Crossfade } from "@/components/radio/crossfade";

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

export default function FTNPlusRadioPage() {
  const { streamUrl, webradioEnabled } = useSiteConfig();
  const [schedule, setSchedule] = useState<ScheduleEntry[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const { info, refresh } = useNowPlaying();
  const { status, pendingSince, volume, setVolume, play, stop } = useRadioPlayer(streamUrl, () => refresh());
  const [pendingNow, setPendingNow] = useState(() => Date.now());
  useEffect(() => {
    if (pendingSince === null) return;
    setPendingNow(Date.now());
    const timer = setInterval(() => setPendingNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [pendingSince]);
  const countdownLeft = pendingSince === null ? 0 : Math.max(0, COUNTDOWN_MS - (pendingNow - pendingSince));
  const bufferLabel = status === "reconnecting" && pendingSince === null ? "Reconnecting…" : "Buffering…";
  const isPlaying = status !== "idle" && status !== "error";
  const isBusy = status === "connecting" || status === "buffering" || status === "reconnecting";

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    fetch("/api/radio/schedule")
      .then((res) => res.json())
      .then((data: any) => setSchedule(Array.isArray(data?.schedule) ? data.schedule : []))
      .catch(() => setSchedule([]));
  }, []);

  useEffect(() => {
    setArtFailed(false);
  }, [info?.artUrl]);

  const togglePlay = () => (isPlaying ? stop() : play());
  useMediaSession(info, { onToggle: togglePlay });

  // Hand playback to the pop-out window: stop here, and the pop-out starts itself.
  const openPopout = () => {
    const wasPlaying = isPlaying;
    const win = window.open(
      `/plus/radio/popout${wasPlaying ? "?autoplay=1" : ""}`,
      "ftn-radio-popout",
      "popup=yes,width=380,height=640"
    );
    if (win && wasPlaying) stop();
  };
  const changeVolume = (value: number) => setVolume(value);

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
      <PageShell className="flex items-center justify-center p-8">
        <EmptyState
          icon={<IconRadio />}
          title="Webradio is offline"
          description="The FTN webradio is currently switched off. Check back soon."
          className="max-w-md"
        />
      </PageShell>
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

  let progress = 0;
  if (show) {
    const start = new Date(show.start).getTime();
    const end = new Date(show.end).getTime();
    progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }

  const shows = new Map<string, ScheduleEntry["show"]>();
  schedule?.forEach((e) => shows.set(e.show.id, e.show));
  const nextIndex = schedule ? schedule.findIndex((e) => new Date(e.start).getTime() > now) : -1;

  return (
    <PageShell>
      {/* HERO: ambient glow from the current art */}
      <div className="relative w-full overflow-hidden select-none">
        <Crossfade id={artUrl || "no-art"} duration={1.4} className="absolute inset-0">
          {artUrl ? (
            <img src={artUrl} alt="" className="h-full w-full object-cover scale-125 blur-3xl opacity-40" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-ftn-surface via-ftn-bg to-ftn-bg" />
          )}
        </Crossfade>
        <div className="absolute inset-0 bg-gradient-to-t from-ftn-bg via-ftn-bg/40 to-ftn-bg/20" />

        <div
          className={cn(
            "relative z-10 flex flex-col-reverse md:flex-row items-start md:items-center justify-between gap-8 md:gap-12 pt-10 md:pt-16 pb-12",
            GUTTER
          )}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-2xl space-y-5 w-full"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {info && !info.online && <Tag>Offline</Tag>}
              {show && show.tag !== "live" && <Tag>{show.tag}</Tag>}
              {info?.listeners !== null && info?.listeners !== undefined && info.listeners >= 2 && (
                <span className="inline-flex items-center gap-1 text-xs text-ftn-text-2">
                  <IconHeadphones className="h-4 w-4" /> {info.listeners} listening
                </span>
              )}
            </div>

            {!info ? (
              <div className="space-y-3" aria-hidden>
                <div className="ftn-skeleton h-12 sm:h-16 w-3/4 rounded-xl" />
                <div className="ftn-skeleton h-5 w-1/3 rounded-lg" />
              </div>
            ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${headline}|${subline}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35 }}
                className="space-y-3"
              >
                <h1 className="ftn-display text-4xl sm:text-6xl md:text-7xl text-ftn-text pb-1">{headline}</h1>
                <p className="text-base sm:text-lg text-ftn-text-2 max-w-2xl">{subline}</p>
              </motion.div>
            </AnimatePresence>
            )}
            {show?.description && <p className="text-sm text-ftn-text-3 line-clamp-2 max-w-2xl">{show.description}</p>}

            {show && info?.track && (
              <div className="flex items-center gap-2 text-sm text-ftn-text-2">
                <IconMusic className="h-4 w-4 text-brand" />
                <span>
                  <span className="font-semibold text-ftn-text">{info.track.title}</span>
                  {info.track.artist ? ` · ${info.track.artist}` : ""}
                </span>
              </div>
            )}

            {show && (
              <div className="max-w-md space-y-2">
                <ProgressBar value={progress} />
                <div className="flex justify-between text-xs ftn-mono text-ftn-text-3">
                  <span>{timeFmt.format(new Date(show.start))}</span>
                  <span>On air until {timeFmt.format(new Date(show.end))}</span>
                </div>
              </div>
            )}

            {isAuto && nextShow && (
              <div className="flex items-center gap-3 rounded-2xl border border-ftn-line bg-ftn-surface/80 backdrop-blur-sm p-2.5 pr-4 max-w-md">
                <ArtTile src={nextShow.artUrl} className="h-12 w-12 rounded-xl flex-shrink-0" />
                <div className="min-w-0">
                  <div className="ftn-eyebrow text-brand">Up next · in {untilLabel(new Date(nextShow.start).getTime() - now)}</div>
                  <div className="text-sm font-semibold truncate">{nextShow.name}</div>
                  <div className="text-xs text-ftn-text-3 truncate">
                    with {nextShow.presenter} · {dayFmt.format(new Date(nextShow.start))} {timeFmt.format(new Date(nextShow.start))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button onClick={togglePlay} disabled={!streamUrl} size="lg" aria-busy={isBusy} className="min-w-[13.5rem]">
                {isBusy ? (
                  <IconLoader2 className="h-5 w-5 animate-spin" />
                ) : isPlaying ? (
                  <IconPlayerPause className="h-5 w-5 fill-current" />
                ) : (
                  <IconPlayerPlay className="h-5 w-5 fill-current" />
                )}
                <span className="tabular-nums">
                {isBusy
                  ? status !== "buffering" && countdownLeft > 0
                    ? `Buffering… ${(countdownLeft / 1000).toFixed(1)}s`
                    : bufferLabel
                  : isPlaying
                    ? "Pause"
                    : status === "error"
                      ? "Try again"
                      : "Listen live"}
                </span>
              </Button>
              <div className="flex items-center gap-3 rounded-full bg-ftn-surface-2 border border-ftn-line-strong h-14 px-6">
                <IconVolume className="h-5 w-5 text-ftn-text-2" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  aria-label="Volume"
                  style={{ "--fill": `${volume * 100}%` } as React.CSSProperties}
                  className="ftn-range w-28"
                />
              </div>
              <Button variant="secondary" size="lg" onClick={openPopout} aria-label="Open pop-out player" className="px-6">
                <IconExternalLink className="h-5 w-5" /> Pop out
              </Button>
            </div>
            {status === "error" && (
              <div className="flex items-center gap-2 text-xs font-semibold text-red-400">
                <IconAlertTriangle className="h-4 w-4" /> The stream stopped responding. Press Try again to reconnect.
              </div>
            )}
          </motion.div>

          {/* Cover art */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="relative flex-shrink-0 self-center md:self-auto md:mr-[6vw]"
          >
            <div
              className={cn(
                "absolute -inset-3 rounded-[2rem] bg-brand/25 blur-2xl transition-opacity duration-700",
                isPlaying ? "opacity-100" : "opacity-30"
              )}
            />
            <Crossfade
              id={artUrl || "no-art"}
              zoom
              className="relative h-56 w-56 sm:h-80 sm:w-80 md:h-[22rem] md:w-[22rem] lg:h-[26rem] lg:w-[26rem] rounded-3xl border border-ftn-line-strong shadow-2xl"
            >
              <ArtTile src={artUrl} onError={() => setArtFailed(true)} className="h-full w-full" />
            </Crossfade>
          </motion.div>
        </div>
      </div>

      {/* LANES */}
      <div className="relative z-20 space-y-10">
        {schedule === null ? (
          <LaneSkeleton shape="square" />
        ) : schedule.length === 0 ? (
          <div className={GUTTER}>
            <EmptyState icon={<IconRadio />} title="No shows scheduled yet" description="Check back soon for the programme." />
          </div>
        ) : (
          <>
            <Lane title="Coming up" href="/plus/schedule" hrefLabel="Full schedule">
              {schedule.map((entry, i) => {
                const start = new Date(entry.start);
                const isNow = start.getTime() <= now && new Date(entry.end).getTime() > now;
                return (
                  <ShowCard
                    key={`${entry.slotId}-${entry.start}`}
                    title={entry.show.name}
                    presenter={entry.show.presenter}
                    artUrl={entry.show.artUrl}
                    badge={isNow ? "On air" : i === nextIndex ? "Up next" : undefined}
                    live={isNow}
                    timeLabel={`${dayFmt.format(start)} ${timeFmt.format(start)} – ${timeFmt.format(new Date(entry.end))}`}
                    tag={entry.tag}
                  />
                );
              })}
            </Lane>

            {shows.size > 0 && (
              <Lane title="The shows">
                {Array.from(shows.values()).map((s) => (
                  <ShowCard key={s.id} title={s.name} presenter={s.presenter} artUrl={s.artUrl} />
                ))}
              </Lane>
            )}
          </>
        )}

        {info?.discordBot.link && (
          <div id="radio-discord" className={GUTTER}>
            <div className="relative overflow-hidden rounded-3xl border border-ftn-line bg-ftn-surface p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-brand/10 blur-3xl" />
              <div className="relative space-y-2 max-w-2xl">
                <div className="ftn-title text-xl flex items-center gap-2">
                  <IconBrandDiscord className="h-6 w-6 text-brand" /> Take FTN Radio to your Discord
                </div>
                <p className="text-sm text-ftn-text-2 leading-relaxed text-pretty">
                  Invite the radio bot to your server, then run the setup command from the voice channel you are in.
                </p>
              </div>
              <div className="relative flex flex-col sm:flex-row gap-3 md:items-center">
                <button
                  type="button"
                  onClick={copyCommand}
                  className="flex items-center justify-between gap-3 rounded-full border border-ftn-line-strong bg-ftn-bg px-5 h-11 text-left cursor-pointer hover:border-brand/50 transition"
                >
                  <code className="text-sm ftn-mono text-ftn-text">{info.discordBot.command}</code>
                  {copied ? <IconCheck className="h-4 w-4 text-emerald-400" /> : <IconCopy className="h-4 w-4 text-ftn-text-2" />}
                </button>
                <Button href={info.discordBot.link} external>
                  Invite the bot
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function ShowCard({
  title,
  presenter,
  artUrl,
  badge,
  live,
  timeLabel,
  tag,
}: {
  title: string;
  presenter: string;
  artUrl: string | null;
  badge?: string;
  live?: boolean;
  timeLabel?: string;
  tag?: string;
}) {
  return (
    <MediaCard shape="square" art={artUrl} title={title} badge={badge} badgeLive={live} className="w-44 sm:w-48 md:w-52">
      <p className="text-xs text-ftn-text-3 truncate">with {presenter}</p>
      {timeLabel && (
        <p className="text-xs ftn-mono text-brand leading-snug pt-1">
          {timeLabel}
          {tag && tag !== "live" ? ` · ${tag}` : ""}
        </p>
      )}
    </MediaCard>
  );
}
