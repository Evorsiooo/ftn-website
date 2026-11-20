"use client";
// A show clicked on the Schedule: when it airs, what the radio plays, and the way to go on air for
// it (the Studio; OBS as the extra). Editing the broadcast is one click away.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Mic, Pencil } from "lucide-react";
import { Facts, Sheet } from "@/components/admin/ui";
import type { Occurrence } from "@/lib/schedule-core";
import { hm as fmtTime } from "@/components/admin/ui";
import { hostedOnRadio, studioHref } from "./on-air-strip";

type Replay = { id: string; kind: "studio" | "playlist"; airingKey: string | null; title: string; showId: string | null; hidden: boolean; startedAt: number; endedAt: number | null };

const day = (d: Date) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });

export function ShowPanel({ occ, onEdit, onClose }: { occ: Occurrence; onEdit: () => void; onClose: () => void }) {
  const [replays, setReplays] = useState<Replay[] | null>(null);
  const [playlistName, setPlaylistName] = useState<string | null>(null);
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

  // This broadcast's own episodes: a playlist show's airings are keyed "<broadcast id>:<start>"; a
  // hosted show's Studio recordings carry its show (or, for a one-time broadcast, its name).
  const realShow = occ.show && !occ.show.oneOff ? occ.show : null;
  const episodes = (replays ?? [])
    .filter((r) => r.endedAt && r.endedAt <= Date.now())
    .filter((r) =>
      occ.plays === "playlist"
        ? r.kind === "playlist" && !!r.airingKey?.startsWith(`${occ.broadcastId}:`)
        : r.kind === "studio" && (realShow ? r.showId === realShow.id : r.title === occ.title),
    )
    .slice(0, 6);
  const plays = !occ.onRadio
    ? ["Video stream only", "This broadcast isn't on the radio."]
    : occ.plays === "playlist"
      ? [`Playlist${playlistName ? `: ${playlistName}` : ""}`, "The AutoDJ shuffles its songs. Nobody needs to be in the Studio."]
      : occ.plays === "stream"
        ? ["A stream", occ.streamUrl ?? ""]
        : ["Live from the Studio", "The AutoDJ plays until you go on air."];

  const canOpen = live && !ended && occ.status !== "cancelled";
  return (
    <Sheet
      title={occ.title}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onEdit} className="btn" style={{ marginRight: "auto" }}>
            <Pencil className="ic" /> Edit
          </button>
          {canOpen && (
            <Link href={studioHref(occ)} className="btn primary">
              <Mic className="ic" /> Open Studio
            </Link>
          )}
        </>
      }
    >
      <Facts
        rows={[
          ["When", `${day(occ.start)}, ${fmtTime(occ.start)} to ${fmtTime(occ.end)}`],
          ["Repeats", occ.recurring ? `Every ${occ.start.toLocaleDateString(undefined, { weekday: "long" })}` : "Once"],
          ...(occ.presenter ? ([["With", occ.presenter]] as [string, string][]) : []),
          ...(occ.status === "cancelled" ? ([["Status", "Cancelled"]] as [string, string][]) : []),
          ["Radio plays", plays[0]],
          ...(plays[1] ? ([["", plays[1]]] as [string, string][]) : []),
        ]}
      />
      {canOpen && <p className="help" style={{ margin: 0 }}>Open Studio: check your microphone, then press Go on air. Calls, the song queue and pause are there.</p>}
      {live && (
        <p className="help" style={{ margin: 0 }}>
          Running the show from OBS instead? The password and setup guide are in{" "}
          <Link href="/admin/settings/radio#obs" className="link">
            Settings, Radio
          </Link>
          .
        </p>
      )}

      {/* a simulcast (another station's stream) or a video-only airing is never recorded, so it has no episodes */}
      {recorded && (
        <section className="todo">
          <h2>Past episodes</h2>
          {replays === null ? (
            <div className="muted">Loading…</div>
          ) : episodes.length ? (
            <div className="rows">
              {episodes.map((r) => (
                <div key={r.id} className="r">
                  <span className="grow">
                    {new Date(r.startedAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · {Math.max(1, Math.round(((r.endedAt ?? r.startedAt) - r.startedAt) / 60000))} min
                    {r.hidden ? " · hidden" : ""}
                  </span>
                  <Link href={`/plus/radio/replays/${r.id}`} className="btn sm ghost">
                    Listen
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">None yet. Each episode is kept as a replay.</div>
          )}
        </section>
      )}
    </Sheet>
  );
}
