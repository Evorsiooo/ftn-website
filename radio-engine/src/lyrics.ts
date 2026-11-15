// Lyrics for the website's radio (loaded as /radio-engine/lyrics.js): BitChord's lookup (src/lyrics), reduced to
// the lines and their times.
import { lookupLyrics } from './lyrics/repository';

export interface RadioLyricLine {
  /** When the line starts, in ms from the start of the song. 0 for every line when the lyrics aren't timed. */
  timeMs: number;
  text: string;
}

export interface RadioLyrics {
  source: string;
  synced: boolean;
  lines: RadioLyricLine[];
}

export async function findLyrics(song: { key: string; title: string; artist: string; durationSec: number }): Promise<RadioLyrics | null> {
  const found = await lookupLyrics({ videoId: song.key, title: song.title, artist: song.artist, durationMs: Math.round(song.durationSec * 1000), album: null });
  if (!found) return null;
  return { source: found.label, synced: found.synced, lines: found.lines.map((l) => ({ timeMs: l.timeMs, text: l.text })) };
}
