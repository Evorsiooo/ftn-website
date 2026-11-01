"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconThumbUp, IconThumbDown } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface VoteState {
  song: { key: string; artist: string; title: string } | null;
  up: number;
  down: number;
  mine: number;
}

// Small up/down vote for the song on air. No sign-in needed.
// It polls on its own so it can sit anywhere without touching the player code.
export function SongVote({ trackKey, className }: { trackKey?: string; className?: string }) {
  const [state, setState] = useState<VoteState | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(() => {
    if (inFlight.current) return;
    fetch("/api/radio/vote")
      .then((r) => r.json())
      .then((d: any) => {
        if (inFlight.current) return;
        setState(d?.song ? (d as VoteState) : null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load, trackKey]);

  if (!state?.song) return null;
  const song = state.song;

  const vote = async (dir: 1 | -1) => {
    if (busy) return;
    const value = state.mine === dir ? 0 : dir;
    setBusy(true);
    inFlight.current = true;
    setHint(null);
    try {
      const res = await fetch("/api/radio/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: song.key, value }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok) setState({ ...state, up: data.up, down: data.down, mine: data.mine });
      else setHint(res.status === 409 ? "That song just changed" : data?.error || "Could not save your vote");
    } catch {
      setHint("Could not save your vote");
    } finally {
      inFlight.current = false;
      setBusy(false);
      setTimeout(load, 0);
    }
  };

  const btn = (dir: 1 | -1, active: boolean, count: number) => {
    const Icon = dir === 1 ? IconThumbUp : IconThumbDown;
    return (
      <button
        type="button"
        onClick={() => vote(dir)}
        disabled={busy}
        aria-pressed={active}
        aria-label={dir === 1 ? "Like this song" : "Dislike this song"}
        className={cn(
          "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold tabular-nums transition",
          active
            ? "border-brand bg-brand/15 text-brand-text"
            : "border-ftn-line-strong bg-ftn-surface-2 text-ftn-text-2 hover:text-ftn-text",
          busy && "opacity-70"
        )}
      >
        <Icon className={cn("h-4 w-4", active && "fill-current")} />
        {count}
      </button>
    );
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {btn(1, state.mine === 1, state.up)}
      {btn(-1, state.mine === -1, state.down)}
      {hint && <span className="text-xs text-ftn-text-3" role="status">{hint}</span>}
    </div>
  );
}
