"use client";
// What listeners think of the songs (likes minus dislikes): the Ratings tab of the Song library.
import React, { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface Rated {
  artist: string;
  title: string;
  up: number;
  down: number;
  score: number;
  votes: number;
}

function List({ title, empty, rows, tone }: { title: string; empty: string; rows: Rated[]; tone: "good" | "bad" }) {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
      <h2 className="mb-4 text-xl font-extrabold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">{empty}</p>
      ) : (
        <ol className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {rows.map((r, i) => (
            <li key={`${r.artist}|${r.title}`} className="flex items-center gap-4 py-3">
              <span className="w-6 text-sm font-bold tabular-nums text-neutral-400">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{r.title}</div>
                <div className="truncate text-sm text-neutral-500">{r.artist || "Unknown artist"}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm tabular-nums">
                <span className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-300"><ThumbsUp className="h-3.5 w-3.5" />{r.up}</span>
                <span className="inline-flex items-center gap-1 text-neutral-600 dark:text-neutral-300"><ThumbsDown className="h-3.5 w-3.5" />{r.down}</span>
                <span className={`w-10 text-right font-extrabold ${tone === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {r.score > 0 ? `+${r.score}` : r.score}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function SongRatings() {
  const [data, setData] = useState<{ best: Rated[]; worst: Rated[]; totalVotes: number; totalSongs: number } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/radio/ratings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: any) => setData(d))
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-sm text-red-600">Could not load ratings.</p>;
  if (!data) return <p className="text-sm text-neutral-500">Loading…</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        {data.totalVotes} vote{data.totalVotes === 1 ? "" : "s"} across {data.totalSongs} song{data.totalSongs === 1 ? "" : "s"}. Score is likes minus dislikes.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <List title="Best rated" tone="good" rows={data.best} empty="No song has a positive score yet." />
        <List title="Worst rated" tone="bad" rows={data.worst} empty="No song has a negative score yet." />
      </div>
    </div>
  );
}
