// Where a radio song can be listened to outside FTN: YouTube Music and Spotify. Used by Liked songs on FTN+ Saved,
// the admin library and the AI tools. Every downloaded song has its YouTube id, so YouTube Music opens the exact song;
// Spotify only does when the song has a Spotify id, otherwise it opens a Spotify search for the artist and title.

const query = (artist: string, title: string) => encodeURIComponent(`${artist} ${title}`.trim());

export function youtubeMusicUrl(youtubeId: string | null | undefined, artist: string, title: string): string {
  return youtubeId ? `https://music.youtube.com/watch?v=${encodeURIComponent(youtubeId)}` : `https://music.youtube.com/search?q=${query(artist, title)}`;
}

export function spotifyUrl(spotifyId: string | null | undefined, artist: string, title: string): string {
  return spotifyId ? `https://open.spotify.com/track/${encodeURIComponent(spotifyId)}` : `https://open.spotify.com/search/${query(artist, title)}`;
}

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

/**
 * A Spotify track id from what an admin pasted: a track link (open.spotify.com/track/…, with or without
 * /intl-xx/ and ?si=…), a spotify:track:… URI, or the bare id. Null when it isn't one.
 */
export function parseSpotifyTrack(input: string): string | null {
  const s = input.trim();
  if (SPOTIFY_ID.test(s)) return s;
  const uri = /^spotify:track:([A-Za-z0-9]{22})$/.exec(s);
  if (uri) return uri[1];
  try {
    const u = new URL(s);
    if (u.hostname !== "open.spotify.com") return null;
    const m = /^\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})\/?$/i.exec(u.pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
