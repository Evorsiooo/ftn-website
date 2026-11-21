// Lyrics for the website's radio (loaded as /radio-engine/lyrics.js): BitChord's lookup (src/lyrics), its LyricClock,
// and the element BitChord draws them with (am-lyrics, the same version), registered as <am-lyrics> when this loads.
import '@uimaxbai/am-lyrics/am-lyrics.js';
import { lookupLyrics, type SourceState } from './lyrics/repository';
import { LYRICS_SOURCES, type LyricsSourceId } from './lyrics/sources';

export { LyricClock } from './lyrics/clock';
export type { SourceState };

export interface RadioLyricLine {
  /** When the line starts, in ms from the start of the song. 0 for every line when the lyrics aren't timed. */
  timeMs: number;
  text: string;
}

export interface RadioLyrics {
  /** The provider's id (lyrics/sources.ts). */
  sourceId: string;
  source: string;
  synced: boolean;
  wordSynced: boolean;
  /** What am-lyrics draws: the provider's own TTML (words, background vocals, duet sides), or one written from the lines. */
  ttml: string;
  lines: RadioLyricLine[];
}

/** The providers, in BitChord's priority order (for the admin's provider picker). */
export const lyricSources: { id: string; label: string; detail: string; wordSynced: boolean }[] = LYRICS_SOURCES.map((s) => ({ ...s }));

export async function findLyrics(
  song: { key: string; title: string; artist: string; durationSec: number; album?: string | null },
  opts: { only?: string | null; onSource?: (source: string, state: SourceState) => void } = {}
): Promise<RadioLyrics | null> {
  const only = opts.only && LYRICS_SOURCES.some((s) => s.id === opts.only) ? (opts.only as LyricsSourceId) : undefined;
  const found = await lookupLyrics(
    { videoId: song.key, title: song.title, artist: song.artist, durationMs: Math.round(song.durationSec * 1000), album: song.album ?? null },
    { ...(only && { only }), ...(opts.onSource && { onSource: opts.onSource }) }
  );
  if (!found) return null;
  return {
    sourceId: found.source,
    source: found.label,
    synced: found.synced,
    wordSynced: found.wordSynced,
    ttml: found.ttml,
    lines: found.lines.map((l) => ({ timeMs: l.timeMs, text: l.text })),
  };
}
