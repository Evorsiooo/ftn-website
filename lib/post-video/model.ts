// The edit of a video post: sources (files the staff member imported) and the clips cut
// from them. Everything is in seconds. The same model drives the preview, the export and the
// saved edit, so a saved post can be reopened and changed.

/** Longest video a post may have. */
export const MAX_DURATION = 30;
/** Largest file Discord accepts for an upload. */
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
export const FPS = 30;
export const MIN_CLIP = 0.2;

export interface SourceInfo {
  id: string;
  kind: "video" | "music";
  name: string;
  duration: number;
  /** Video only: size as shown (rotation applied). */
  width: number;
  height: number;
  hasAudio: boolean;
  /** Where the file lives in R2 once uploaded. */
  url: string | null;
}

export interface VideoClip {
  id: string;
  sourceId: string;
  /** Part of the source that is used. */
  start: number;
  end: number;
  /** 0 to 1. */
  volume: number;
  zoom: number;
  focusX: number;
  focusY: number;
}

export interface MusicClip {
  id: string;
  sourceId: string;
  start: number;
  end: number;
  /** Where the clip begins on the timeline. */
  at: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface Project {
  clips: VideoClip[];
  music: MusicClip[];
}

export const emptyProject = (): Project => ({ clips: [], music: [] });

export const clipLength = (c: { start: number; end: number }) => c.end - c.start;

export function projectDuration(project: Project): number {
  return project.clips.reduce((sum, c) => sum + clipLength(c), 0);
}

/** Timeline start of each video clip (clips play one after another). */
export function clipStarts(clips: VideoClip[]): number[] {
  let t = 0;
  return clips.map((c) => {
    const at = t;
    t += clipLength(c);
    return at;
  });
}

/** The video clip playing at timeline time t, with the time it starts at. */
export function clipAt(clips: VideoClip[], t: number): { clip: VideoClip; index: number; at: number } | null {
  let at = 0;
  for (let i = 0; i < clips.length; i++) {
    const len = clipLength(clips[i]);
    if (t < at + len || i === clips.length - 1) return { clip: clips[i], index: i, at };
    at += len;
  }
  return null;
}

export const newId = () => Math.random().toString(36).slice(2, 10);

/** What is saved with the post so it can be edited again. */
export interface SavedEdit {
  v: 1;
  sources: { id: string; kind: "video" | "music"; name: string; url: string }[];
  project: Project;
}

export function parseSavedEdit(raw: string | null | undefined): SavedEdit | null {
  try {
    const data = JSON.parse(raw || "null");
    if (data && data.v === 1 && Array.isArray(data.sources) && data.project) return data as SavedEdit;
  } catch {
    /* fall through */
  }
  return null;
}
