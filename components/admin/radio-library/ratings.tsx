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
    <section className="todo">
      <h2>{title}</h2>
      <div className="rows">
        {rows.length === 0 ? (
          <div className="r muted">{empty}</div>
        ) : (
          rows.map((r, i) => (
            <div key={`${r.artist}|${r.title}`} className="r">
              <span className="t12 num faint" style={{ width: 20 }}>
                {i + 1}
              </span>
              <div className="grow">
                <div className="trunc" style={{ fontWeight: 600 }}>
                  {r.title}
                </div>
                <div className="t12 muted trunc">{r.artist || "Unknown artist"}</div>
              </div>
              <span className="t12 muted num" style={{ display: "inline-flex", gap: 10 }}>
                <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
                  <ThumbsUp className="ic-sm" />
                  {r.up}
                </span>
                <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
                  <ThumbsDown className="ic-sm" />
                  {r.down}
                </span>
              </span>
              <span className={tone === "good" ? "pill green num" : "pill red num"}>{r.score > 0 ? `+${r.score}` : r.score}</span>
            </div>
          ))
        )}
      </div>
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

  if (error) return <div className="empty">Could not load ratings.</div>;
  if (!data) return <div className="empty">Loading…</div>;
  return (
    <div className="today" style={{ maxWidth: 1000 }}>
      <p className="muted" style={{ margin: 0 }}>
        {data.totalVotes} vote{data.totalVotes === 1 ? "" : "s"} across {data.totalSongs} song{data.totalSongs === 1 ? "" : "s"}. Score is likes minus dislikes.
      </p>
      <div className="two" style={{ gap: 24, alignItems: "start" }}>
        <List title="Best rated" tone="good" rows={data.best} empty="No song has a positive score yet." />
        <List title="Worst rated" tone="bad" rows={data.worst} empty="No song has a negative score yet." />
      </div>
    </div>
  );
}
