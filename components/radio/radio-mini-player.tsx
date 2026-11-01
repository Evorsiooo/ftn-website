"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconLoader2, IconPlayerPauseFilled, IconPlayerPlayFilled, IconVolume, IconVolume3, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { ArtTile } from "@/components/ftn/media";
import { useRadio } from "./radio-provider";

/**
 * The floating radio player. Always dark (like the FTN+ player), a glass card in the corner on
 * desktop and a full-width bar above the safe area on phones.
 */
export function RadioMiniPlayer() {
  const { info, status, volume, muted, setVolume, toggleMute, play, stop, dismissMini } = useRadio();
  const onPlus = (usePathname() || "").startsWith("/plus");
  const [artFailed, setArtFailed] = React.useState(false);
  React.useEffect(() => setArtFailed(false), [info?.artUrl]);

  const playing = status === "playing";
  const busy = status === "connecting" || status === "buffering" || status === "reconnecting";
  const active = playing || busy;
  const show = info?.currentShow || null;
  const title = show ? show.name : info?.track?.title || info?.stationName || "FTN Radio";
  const sub = show ? `with ${show.presenter}` : info?.track ? info.track.artist || "Unknown artist" : "Non-stop music";
  const art = info?.artUrl && !artFailed ? info.artUrl : null;
  const shown = muted ? 0 : volume;

  return (
    <div
      data-ftn-theme="dark"
      role="region"
      aria-label="FTN Radio player"
      className={cn(
        "ftn-mini fixed z-[60] text-ftn-text",
        "inset-x-2.5",
        // On phones FTN+ has a floating tab bar along the bottom; sit above it.
        onPlus ? "bottom-[calc(5.75rem+env(safe-area-inset-bottom))]" : "bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
        "sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[24rem]"
      )}
    >
      <div className="group/mini relative flex items-center gap-3 overflow-hidden rounded-[1.4rem] border border-white/10 bg-[#12141a]/95 p-2 pr-2.5 shadow-[0_18px_50px_-14px_rgb(0_0_0/0.85)] backdrop-blur-2xl">
        {/* the art tints the card */}
        {art && <img src={art} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full scale-150 object-cover opacity-[0.16] blur-2xl saturate-150" />}

        <Link href="/plus/radio" prefetch={false} aria-label="Open the webradio page" className="relative block h-12 w-12 flex-none overflow-hidden rounded-2xl ring-1 ring-white/15">
          <ArtTile src={art} onError={() => setArtFailed(true)} className="h-full w-full" />
        </Link>

        <div className="relative min-w-0 flex-1">
          <div className="ftn-title truncate text-[15px] leading-tight">{title}</div>
          <div className="truncate text-xs text-ftn-text-2">{sub}</div>
        </div>

        <div className="relative flex flex-none items-center gap-0.5">
          {/* volume: desktop only, the slider opens on hover or focus */}
          <div className="peer/vol group/vol hidden items-center sm:flex">
            <div className="w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100 group-focus-within/vol:w-20 group-focus-within/vol:opacity-100">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={shown}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volume"
                style={{ "--fill": `${shown * 100}%` } as React.CSSProperties}
                className="ftn-range block w-[4.75rem]"
              />
            </div>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-ftn-text-2 transition hover:bg-white/10 hover:text-ftn-text"
            >
              {shown === 0 ? <IconVolume3 className="h-[18px] w-[18px]" /> : <IconVolume className="h-[18px] w-[18px]" />}
            </button>
          </div>

          <button
            type="button"
            onClick={() => (active ? stop() : play())}
            aria-label={active ? "Pause radio" : "Play radio"}
            className="ml-1 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-brand text-brand-ink transition hover:bg-brand-hover active:scale-95"
          >
            {busy ? <IconLoader2 className="h-5 w-5 animate-spin" /> : active ? <IconPlayerPauseFilled className="h-5 w-5" /> : <IconPlayerPlayFilled className="h-5 w-5" />}
          </button>

          <button
            type="button"
            onClick={dismissMini}
            aria-label="Close the radio player"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-ftn-text-3 transition hover:bg-white/10 hover:text-ftn-text"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
