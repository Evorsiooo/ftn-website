import { paintPost, type PostLayers } from "@/lib/post-template";
import { clipAt, clipLength, projectDuration, type MusicClip, type Project } from "./model";
import type { LoadedSource } from "./sources";

// Plays the edit in the browser: one hidden video element per imported video (and an audio
// element per song), with the current frame drawn into the preview canvas through the same
// template code the export uses.
const SYNC_TOLERANCE = 0.3;
const PRELOAD_AHEAD = 0.6;

const emptyProject: Project = { clips: [], music: [] };

export class PreviewPlayer {
  private ctx: CanvasRenderingContext2D;
  private layers: PostLayers | null = null;
  private project: Project = emptyProject;
  private videos = new Map<string, HTMLVideoElement>();
  private songs = new Map<string, HTMLAudioElement>();
  private t = 0;
  private playing = false;
  private anchor = { perf: 0, t: 0 };
  private raf = 0;
  private activeClipId: string | null = null;
  private disposed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private onTime: (t: number) => void,
    private onPlaying: (playing: boolean) => void
  ) {
    this.ctx = canvas.getContext("2d")!;
  }

  get time() {
    return this.t;
  }

  get isPlaying() {
    return this.playing;
  }

  setLayers(layers: PostLayers | null) {
    this.layers = layers;
    // "No ad" posts are shorter than the full square.
    if (layers && this.canvas.height !== layers.under.height) this.canvas.height = layers.under.height;
    this.draw();
  }

  setSources(sources: Map<string, LoadedSource>) {
    for (const [id, el] of this.videos) {
      if (!sources.has(id)) {
        el.pause();
        el.removeAttribute("src");
        this.videos.delete(id);
      }
    }
    for (const [id, el] of this.songs) {
      if (!sources.has(id)) {
        el.pause();
        el.removeAttribute("src");
        this.songs.delete(id);
      }
    }
    for (const [id, source] of sources) {
      if (source.info.kind === "video" && !this.videos.has(id)) {
        const el = document.createElement("video");
        el.src = source.objectUrl;
        el.preload = "auto";
        el.playsInline = true;
        el.onseeked = () => this.draw();
        el.onloadeddata = () => this.draw();
        this.videos.set(id, el);
      }
      if (source.info.kind === "music" && !this.songs.has(id)) {
        const el = document.createElement("audio");
        el.src = source.objectUrl;
        el.preload = "auto";
        this.songs.set(id, el);
      }
    }
  }

  setProject(project: Project) {
    this.project = project;
    const end = projectDuration(project);
    if (this.t > end) this.t = end;
    if (!this.playing) this.seek(this.t);
    else this.draw();
  }

  seek(time: number) {
    const end = projectDuration(this.project);
    this.t = Math.min(Math.max(0, time), end);
    this.anchor = { perf: performance.now(), t: this.t };
    this.pauseAllMedia();
    const active = this.activeAt(this.t);
    if (active) {
      const el = this.videos.get(active.clip.sourceId);
      if (el) el.currentTime = active.clip.start + (this.t - active.at);
      this.activeClipId = active.clip.id;
    }
    this.draw();
    this.onTime(this.t);
  }

  play() {
    const end = projectDuration(this.project);
    if (end <= 0 || this.playing) return;
    if (this.t >= end - 0.02) this.t = 0;
    this.playing = true;
    this.anchor = { perf: performance.now(), t: this.t };
    this.activeClipId = null;
    this.onPlaying(true);
    this.raf = requestAnimationFrame(this.tick);
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.pauseAllMedia();
    this.onPlaying(false);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.pauseAllMedia();
    for (const el of [...this.videos.values(), ...this.songs.values()]) el.removeAttribute("src");
    this.videos.clear();
    this.songs.clear();
  }

  private pauseAllMedia() {
    this.videos.forEach((el) => el.pause());
    this.songs.forEach((el) => el.pause());
  }

  private activeAt(t: number) {
    const end = projectDuration(this.project);
    return clipAt(this.project.clips, Math.min(t, Math.max(0, end - 0.001)));
  }

  private tick = () => {
    if (this.disposed || !this.playing) return;
    const end = projectDuration(this.project);
    this.t = this.anchor.t + (performance.now() - this.anchor.perf) / 1000;
    if (this.t >= end) {
      this.t = end;
      this.pause();
      this.draw();
      this.onTime(this.t);
      return;
    }
    this.syncMedia();
    this.draw();
    this.onTime(this.t);
    this.raf = requestAnimationFrame(this.tick);
  };

  private syncMedia() {
    const active = this.activeAt(this.t);
    if (!active) return;
    const { clip, at, index } = active;
    const el = this.videos.get(clip.sourceId);
    const want = clip.start + (this.t - at);
    if (el) {
      if (this.activeClipId !== clip.id) {
        // Moved on to the next clip.
        this.videos.forEach((other, id) => id !== clip.sourceId && other.pause());
        el.currentTime = want;
        this.activeClipId = clip.id;
        void el.play().catch(() => {});
      } else if (el.paused) {
        void el.play().catch(() => {});
      } else if (Math.abs(el.currentTime - want) > SYNC_TOLERANCE) {
        el.currentTime = want;
      }
      el.volume = Math.min(1, Math.max(0, clip.volume));
    }

    // Warm up the next clip when it comes from another file.
    const next = this.project.clips[index + 1];
    if (next && next.sourceId !== clip.sourceId && at + clipLength(clip) - this.t < PRELOAD_AHEAD) {
      const nextEl = this.videos.get(next.sourceId);
      if (nextEl && Math.abs(nextEl.currentTime - next.start) > 0.05) nextEl.currentTime = next.start;
    }

    for (const m of this.project.music) this.syncSong(m);
  }

  private syncSong(m: MusicClip) {
    const el = this.songs.get(m.sourceId);
    if (!el) return;
    const length = m.end - m.start;
    const local = this.t - m.at;
    if (local < 0 || local >= length) {
      if (!el.paused) el.pause();
      return;
    }
    const want = m.start + local;
    if (el.paused) {
      el.currentTime = want;
      void el.play().catch(() => {});
    } else if (Math.abs(el.currentTime - want) > SYNC_TOLERANCE) {
      el.currentTime = want;
    }
    const fadeIn = m.fadeIn > 0 ? Math.min(1, local / m.fadeIn) : 1;
    const fadeOut = m.fadeOut > 0 ? Math.min(1, (length - local) / m.fadeOut) : 1;
    el.volume = Math.min(1, Math.max(0, m.volume * fadeIn * fadeOut));
  }

  draw() {
    if (!this.layers || this.disposed) return;
    const active = this.activeAt(this.t);
    const el = active ? this.videos.get(active.clip.sourceId) : undefined;
    const ready = el && el.readyState >= 2 && el.videoWidth > 0;
    paintPost(
      this.ctx,
      this.layers,
      ready ? { image: el, width: el.videoWidth, height: el.videoHeight } : null,
      active?.clip.zoom ?? 1,
      active?.clip.focusX ?? 0.5,
      active?.clip.focusY ?? 0.5
    );
  }
}
