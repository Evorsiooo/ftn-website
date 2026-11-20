// Radio clips: short videos cut from a show's replay, posted like any other video post.
// A clip is saved on its post (in videoEdit) as the replay and the stretch of the show it covers,
// so it can be opened in the editor again and so its Discord message can link to the replay.

/** Longest clip. 60 s of a mostly still picture fits Discord's 20 MB at a good quality. */
export const MAX_CLIP_MS = 60_000;
export const MIN_CLIP_MS = 3_000;
/** Length of a new clip made at the playhead. */
export const DEFAULT_CLIP_MS = 30_000;

/** What a radio clip post stores in posts.video_edit. */
export interface RadioClipEdit {
  v: "radio";
  replayId: string;
  /** Server ms of the show (the same clock as the replay's parts). */
  startMs: number;
  endMs: number;
  /** Keep the songs under the voices (off: voices only). */
  music: boolean;
  /** When the show started (server ms), so the replay link can open at the clip. */
  showStartedAt?: number;
}

export function parseRadioClipEdit(raw: string | null | undefined): RadioClipEdit | null {
  try {
    const d = JSON.parse(raw || "null");
    if (d && d.v === "radio" && typeof d.replayId === "string" && Number.isFinite(d.startMs) && Number.isFinite(d.endMs) && d.endMs > d.startMs) {
      return {
        v: "radio",
        replayId: d.replayId,
        startMs: d.startMs,
        endMs: d.endMs,
        music: d.music !== false,
        showStartedAt: Number.isFinite(d.showStartedAt) ? d.showStartedAt : undefined,
      };
    }
  } catch {
    /* not a radio clip */
  }
  return null;
}

/** A person heard on the show. */
export interface ShowPerson {
  userId: string;
  name: string;
  avatar: string | null;
}

/** A show's replay as the clip editor needs it (GET /api/admin/posts/radio-shows/[id]). */
export interface ClipShow {
  id: string;
  title: string;
  art: string | null;
  startedAt: number;
  endedAt: number;
  timelines: string[];
  voices: { key: string; start: number; end: number; userId: string | null }[];
  pauses: { start: number; end: number }[];
  people: ShowPerson[];
}

/** One clip being made in the editor. */
export interface ClipDraft {
  id: string;
  startMs: number;
  endMs: number;
  headline: string;
  roState: string;
  /** "" = placeholder ad, "none" = no ad, else the ad's id. */
  adId: string;
  music: boolean;
  /** Local date-time ("2026-11-21T18:00") to send it at, or "" for right away. */
  sendAt: string;
}

export const clipLen = (c: { startMs: number; endMs: number }) => c.endMs - c.startMs;

/** "1:05:09" or "5:09" from ms. */
export function clockOf(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}
