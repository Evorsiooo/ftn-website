"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconThumbUp, IconThumbDown } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Same normalising the server uses to key a song (lower-cased, whitespace collapsed).
const normalise = (key: string) => key.replace(/\s+/g, " ").trim().toLowerCase();

// Small up/down vote for the song on screen. No sign-in needed, and no totals: listeners only see
// their own choice. Counts are admin-only.
//
// The vote is always tied to `trackKey` ("artist|title" of what the page is showing). A stored vote
// belongs to one song and is simply not shown for any other, so when the song changes the buttons
// reset at once, and a slow answer for the previous song can never land on the new one.
export function SongVote({ trackKey, className }: { trackKey: string; className?: string }) {
  const key = normalise(trackKey);
  const keyRef = useRef(key);
  keyRef.current = key;

  const [vote, setVote] = useState<{ key: string; mine: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(() => {
    if (busyRef.current) return;
    const asked = keyRef.current;
    fetch("/api/radio/vote")
      .then((r) => r.json())
      .then((d: any) => {
        // Ignore the answer unless it is about the song that is on screen right now.
        if (busyRef.current || keyRef.current !== asked) return;
        if (d?.song?.key === asked) setVote({ key: asked, mine: d.mine === 1 || d.mine === -1 ? d.mine : 0 });
      })
      .catch(() => {});
  }, []);

  // New song: drop the old state straight away, then fetch this listener's vote for the new one.
  useEffect(() => {
    setHint(null);
    setVote(null);
    load();
    // The stream's own metadata can trail the page by a few seconds, so look once more shortly after.
    const retry = setTimeout(load, 4000);
    const poll = setInterval(load, 15000);
    return () => {
      clearTimeout(retry);
      clearInterval(poll);
    };
  }, [key, load]);

  const mine = vote && vote.key === key ? vote.mine : 0;

  const cast = async (dir: 1 | -1) => {
    if (busyRef.current) return;
    const sent = key;
    const value = mine === dir ? 0 : dir;
    busyRef.current = true;
    setBusy(true);
    setHint(null);
    try {
      const res = await fetch("/api/radio/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: sent, value }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (keyRef.current !== sent) return; // the song changed while saving: this answer is stale
      if (res.ok) setVote({ key: sent, mine: data.mine === 1 || data.mine === -1 ? data.mine : 0 });
      else setHint(res.status === 409 ? "That song just changed" : data?.error || "Could not save your vote");
    } catch {
      if (keyRef.current === sent) setHint("Could not save your vote");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const btn = (dir: 1 | -1, active: boolean) => {
    const Icon = dir === 1 ? IconThumbUp : IconThumbDown;
    return (
      <button
        type="button"
        onClick={() => cast(dir)}
        disabled={busy}
        aria-pressed={active}
        aria-label={dir === 1 ? "Like this song" : "Dislike this song"}
        className={cn(
          "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition",
          active
            ? "border-brand bg-brand/15 text-brand-text"
            : "border-ftn-line-strong bg-ftn-surface-2 text-ftn-text-2 hover:text-ftn-text",
          busy && "opacity-70"
        )}
      >
        <Icon className={cn("h-4 w-4", active && "fill-current")} />
      </button>
    );
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {btn(1, mine === 1)}
      {btn(-1, mine === -1)}
      {hint && <span className="text-xs text-ftn-text-3" role="status">{hint}</span>}
    </div>
  );
}
