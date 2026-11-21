// The lyrics choice an admin makes per song (provider and offset), shared by every listener.
// BitChord lets each listener pick a provider (LyricsPanel's picker) and set an offset (LyricsOffsetSheet.kt);
// on the radio everyone hears the same song, so the choice is made once, in the admin, for all.

/** The provider ids in radio-engine/src/lyrics/sources.ts (BitChord's LYRICS_SOURCES, as the radio has them). */
export const LYRIC_SOURCE_IDS = ["lrc-red", "bini", "better-lyrics", "better-lyrics-portato", "paxsenix", "lyrics-plus", "unison", "kugou", "lrclib", "musixmatch"] as const;

/** null = best available (BitChord's default lookup), a provider id, or "none" (show no lyrics for this song). */
export type LyricsSource = (typeof LYRIC_SOURCE_IDS)[number] | "none" | null;

/** BitChord's offset range and step (PlayerHost.kt MIN/MAX_LYRICS_OFFSET_MS, LyricsOffsetSheet.kt StepMs). */
export const MIN_LYRICS_OFFSET_MS = -5_000;
export const MAX_LYRICS_OFFSET_MS = 5_000;
export const LYRICS_OFFSET_STEP_MS = 100;

export function isLyricsSource(v: unknown): v is LyricsSource {
  return v === null || v === "none" || (typeof v === "string" && (LYRIC_SOURCE_IDS as readonly string[]).includes(v));
}

export function isLyricsOffset(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= MIN_LYRICS_OFFSET_MS && v <= MAX_LYRICS_OFFSET_MS && v % LYRICS_OFFSET_STEP_MS === 0;
}

/** What listeners get for a song: only songs with a choice are listed. */
export type LyricsChoice = { source: LyricsSource; offsetMs: number };
