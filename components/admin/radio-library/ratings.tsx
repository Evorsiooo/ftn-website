"use client";
// What listeners think of the songs (likes minus dislikes): the Ratings tab of the Song library.
// One table sorted by score, best at the top; the server sends the 25 best and the 25 worst.
import React, { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Seg } from "@/components/admin/ui";

interface Rated {
  artist: string;
  title: string;
  up: number;
  down: number;
  score: number;
  votes: number;
}

type Show = "all" | "liked" | "disliked";

export function SongRatings() {
  const [data, setData] = useState<{ best: Rated[]; worst: Rated[]; totalVotes: number; totalSongs: number } | null>(null);
  const [error, setError] = useState(false);
  const [show, setShow] = useState<Show>("all");

  useEffect(() => {
    fetch("/api/admin/radio/ratings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: any) => setData(d))
      .catch(() => setError(true));
  }, []);

  if (error) return <div className="empty">Could not load ratings.</div>;
  if (!data) return <div className="empty">Loading…</div>;

  const worst = [...data.worst].reverse();
  const rows = show === "liked" ? data.best : show === "disliked" ? data.worst : [...data.best, ...worst];

  return (
    <div className="ratings">
      <div className="ratings-top">
        <Seg
          value={show}
          onChange={setShow}
          label="Show"
          options={[
            { value: "all", label: "All rated", n: data.best.length + data.worst.length },
            { value: "liked", label: "Liked", n: data.best.length },
            { value: "disliked", label: "Disliked", n: data.worst.length },
          ]}
        />
        <span className="t12 muted">
          {data.totalVotes} vote{data.totalVotes === 1 ? "" : "s"} across {data.totalSongs} song{data.totalSongs === 1 ? "" : "s"}. Score is likes minus dislikes.
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="empty">{show === "disliked" ? "No song has a negative score yet." : show === "liked" ? "No song has a positive score yet." : "No votes yet."}</div>
      ) : (
        <table className="table ratings-table">
          <thead>
            <tr>
              <th style={{ width: 48 }}>#</th>
              <th>Song</th>
              <th className="r-num">
                <ThumbsUp className="ic-sm" aria-label="Likes" />
              </th>
              <th className="r-num">
                <ThumbsDown className="ic-sm" aria-label="Dislikes" />
              </th>
              <th className="r-num hide-m">Votes</th>
              <th className="r-num">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.artist}|${r.title}`}>
                <td className="num faint">{i + 1}</td>
                <td>
                  <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                    {r.title}
                  </span>
                  <span className="t12 muted trunc" style={{ display: "block" }}>
                    {r.artist || "Unknown artist"}
                  </span>
                </td>
                <td className="r-num num">{r.up}</td>
                <td className="r-num num">{r.down}</td>
                <td className="r-num num hide-m">{r.votes}</td>
                <td className="r-num">
                  <span className={r.score > 0 ? "pill green num" : "pill red num"}>{r.score > 0 ? `+${r.score}` : r.score}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
