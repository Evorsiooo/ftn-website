"use client";
// Liked songs on FTN+ Saved: every song the listener gave a thumbs up on the radio, with buttons to listen to it on
// YouTube Music or Spotify (FTN+ doesn't play songs on demand: it's a radio).
import { useState } from "react";
import * as I from "./icons";
import type { LikedSong } from "./saved";

const SHOWN = 8;

const len = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : null);

const YouTubeMusic = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10.4 9.6v4.8l4-2.4z" fill="currentColor" />
  </svg>
);
const Spotify = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M7 9.6c3.4-1 7.2-.7 10 .9M7.6 12.6c2.8-.8 5.8-.5 8.2.8M8.2 15.4c2.2-.6 4.4-.4 6.3.6" fill="none" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const Liked = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
    <path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7" />
  </svg>
);

export function LikedSongs({ songs, onUnlike }: { songs: LikedSong[]; onUnlike: (key: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? songs : songs.slice(0, SHOWN);
  return (
    <section className="likes">
      <h2 className="h2">Liked songs</h2>
      <div className="muted lcount">
        {songs.length === 1 ? "1 song" : `${songs.length} songs`} you liked on the radio
      </div>
      <ol className={`tracks${shown.length > 4 ? " two" : ""}`} style={{ ["--rows" as any]: Math.ceil(shown.length / 2) }}>
        {shown.map((s) => (
          <li key={s.key}>
            {s.art ? (
              <img src={s.art} alt="" loading="lazy" />
            ) : (
              <span className="ph" aria-hidden>
                <I.Note />
              </span>
            )}
            <span className="tx">
              <span className="a" title={s.title}>
                {s.title}
              </span>
              <span className="b">
                {s.artist}
                {len(s.durationSec) && (
                  <>
                    {" · "}
                    <span className="num">{len(s.durationSec)}</span>
                  </>
                )}
              </span>
            </span>
            <a className="svc" href={s.youtubeMusic} target="_blank" rel="noopener noreferrer" aria-label={`Open ${s.title} on YouTube Music`} title="Open on YouTube Music">
              <YouTubeMusic />
              <span>YouTube Music</span>
            </a>
            <a
              className="svc"
              href={s.spotify}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.spotifyExact ? `Open ${s.title} on Spotify` : `Search for ${s.title} on Spotify`}
              title={s.spotifyExact ? "Open on Spotify" : "Search on Spotify"}
            >
              <Spotify />
              <span>Spotify</span>
            </a>
            <button className="ib liked" aria-label={`Remove ${s.title} from liked songs`} title="Remove from liked songs" aria-pressed="true" onClick={() => onUnlike(s.key)}>
              <Liked />
            </button>
          </li>
        ))}
      </ol>
      {songs.length > SHOWN && (
        <button className="btn ghost allbtn" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${songs.length} songs`}
        </button>
      )}
    </section>
  );
}
