"use client";
// A show clicked on the Schedule: when it airs, what the radio plays, and the way to go on air for
// it (the Studio; OBS as the extra). Editing the broadcast is one click away.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Occurrence } from "@/lib/schedule-core";
import { fmtTime } from "@/lib/schedule-client";
import { hostedOnRadio, studioHref } from "./on-air-strip";
import { ObsPanel } from "./obs-panel";

type Replay = { id: string; title: string; showId: string | null; hidden: boolean; startedAt: number; endedAt: number | null };

const day = (d: Date) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
const label = "text-[11px] font-bold uppercase tracking-widest text-neutral-500";

export function ShowPanel({ occ, onEdit, onClose }: { occ: Occurrence; onEdit: () => void; onClose: () => void }) {
  const [replays, setReplays] = useState<Replay[] | null>(null);
  const [playlistName, setPlaylistName] = useState<string | null>(null);
  const [obs, setObs] = useState(false);
  const live = hostedOnRadio(occ);
  const ended = occ.end.getTime() < Date.now();
  // only Studio shows and playlist shows are kept as replays (lib/radio/studio.ts)
  const recorded = occ.onRadio && occ.plays !== "stream";

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/radio/replays")
      .then((r) => (r.ok ? r.json() : { replays: [] }))
      .then((d: any) => alive && setReplays(d.replays ?? []))
      .catch(() => alive && setReplays([]));
    if (occ.plays === "playlist" && occ.playlistId)
      fetch("/api/admin/radio/playlists")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: any) => alive && setPlaylistName(d?.playlists?.find((p: any) => p.id === occ.playlistId)?.name ?? null))
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [occ.plays, occ.playlistId]);

  const episodes = (replays ?? []).filter((r) => r.endedAt && r.endedAt <= Date.now() && (occ.show ? r.showId === occ.show.id : r.title === occ.title)).slice(0, 6);
  const plays = !occ.onRadio
    ? ["Video stream only", "This broadcast isn't on the radio."]
    : occ.plays === "playlist"
      ? [`Playlist${playlistName ? `: ${playlistName}` : ""}`, "The AutoDJ plays it in order. Nobody needs to be in the Studio."]
      : occ.plays === "stream"
        ? ["A stream", occ.streamUrl ?? ""]
        : ["Live from the Studio", "The AutoDJ plays until you go on air."];

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={occ.title}
        className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-card text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 bg-brand px-6 py-5 text-brand-ink">
          <h2 className="truncate text-xl font-extrabold">{occ.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-full bg-[#16110a] text-[#fff8e6] hover:bg-black">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-5 p-6">
          <div>
            <div className={label}>When</div>
            <div className="mt-1 font-semibold">
              {day(occ.start)}, {fmtTime(occ.start)} to {fmtTime(occ.end)}
            </div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              {[occ.recurring ? `Every ${occ.start.toLocaleDateString(undefined, { weekday: "long" })}` : "Once", occ.presenter ? `with ${occ.presenter}` : null, occ.status === "cancelled" ? "cancelled" : null].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div>
            <div className={label}>What the radio plays</div>
            <div className="mt-1 font-semibold">{plays[0]}</div>
            {plays[1] && <div className="break-all text-sm text-neutral-600 dark:text-neutral-400">{plays[1]}</div>}
          </div>

          <div className="flex flex-wrap gap-2">
            {live && !ended && occ.status !== "cancelled" && (
              <Link href={studioHref(occ)} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-6 text-[15px] font-bold text-brand-ink hover:bg-brand-hover">
                <Mic className="h-4 w-4" /> Open Studio
              </Link>
            )}
            <Button variant="outline" onClick={onEdit} className="h-11 cursor-pointer rounded-full px-5">
              Edit
            </Button>
          </div>
          {live && !ended && occ.status !== "cancelled" && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">Opens this show&apos;s Studio: check your microphone, then press Go on air. Calls, the song queue and pause are there.</p>
          )}

          {live && (
            <div className="border-t border-border pt-4">
              <button type="button" onClick={() => setObs(true)} className="cursor-pointer text-sm font-bold underline">
                Broadcast from OBS instead
              </button>
            </div>
          )}

          {/* a simulcast (another station's stream) or a video-only airing is never recorded, so it has no episodes */}
          {recorded && (
          <div className="border-t border-border pt-4">
            <div className="font-bold">Past episodes</div>
            {replays === null ? (
              <div className="mt-2 text-sm text-neutral-500">Loading…</div>
            ) : episodes.length ? (
              <ul className="mt-2 space-y-2">
                {episodes.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      {new Date(r.startedAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · {Math.max(1, Math.round(((r.endedAt ?? r.startedAt) - r.startedAt) / 60000))} min
                      {r.hidden ? " · hidden" : ""}
                    </span>
                    <Link href={`/plus/radio/replays/${r.id}`} className="font-bold underline">
                      Listen
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-sm text-neutral-500">None yet. Each episode is kept as a replay.</div>
            )}
          </div>
          )}
        </div>
      </aside>
      {obs && <ObsPanel onClose={() => setObs(false)} />}
    </div>
  );
}
