// "Prepare" for the website's admin (Library page and Studio): BitChord's analyzer, unchanged, run on several
// songs at once, one Web Worker each (Adrien, 2026-11-25: fast, without cutting corners). Each finished
// analysis is shared exactly as a listener shares one (PUT /api/radio/analysis/<key>, checked by the website),
// so the song can be mixed by every listener. Loaded by the page as /radio-engine/prepare.js, only when someone
// presses Prepare (or a broadcaster queues a song): nothing here runs on its own.
import { Analyzer } from './bitchord/automix/analysis/analyzer';
import type { TrackAnalysis } from './bitchord/automix/analysis/types';
import { ANALYSIS_VERSION } from './bitchord/automix/analysis/types';
import { analysisWriteUrl, fileUrl } from './radio/config';
import { addMusicVideos } from './radio/fetchAudio';

export interface PrepSongRef {
  key: string;
  title: string;
  artist: string;
  musicVideo?: boolean;
}

export type AnalyseOutcome =
  | { state: 'done'; ms: number; bpm: number | null }
  | { state: 'missing' }
  | { state: 'failed'; message: string };

/**
 * Analyses at once on this PC: one per core, keeping one core free so the PC stays usable, and at most 7
 * (about 150 to 250 MB of memory each while a song is in progress).
 */
export function defaultWorkers(): number {
  const cores = navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(7, cores - 1));
}

function waitFor(an: Analyzer, song: PrepSongRef): Promise<TrackAnalysis> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const done = an.get(song.key);
      if (done) {
        off();
        resolve(done);
      } else if (an.statusOf(song.key) === 'error') {
        off();
        reject(new Error('the analysis failed'));
      }
    };
    const off = an.subscribe(check);
    an.request(song.key, { title: song.title, artist: song.artist }, true);
    check();
  });
}

export interface Preparer {
  readonly workers: number;
  /** Analyses one song on the least busy analyzer and shares the result. Never throws for the song's own faults. */
  analyse(song: PrepSongRef): Promise<AnalyseOutcome>;
  /** Ends the analyzers' workers. */
  close(): void;
}

export function createPreparer(workers = defaultWorkers()): Preparer {
  const slots = Array.from({ length: Math.max(1, workers) }, () => ({ an: new Analyzer(), busy: 0 }));
  return {
    workers: slots.length,
    async analyse(song) {
      const slot = slots.reduce((a, b) => (b.busy < a.busy ? b : a));
      slot.busy++;
      const started = performance.now();
      try {
        // a file that isn't in the bucket: set aside as "missing", not retried
        const head = await fetch(fileUrl(song.key), { method: 'HEAD', cache: 'no-store' });
        if (head.status === 404 || head.status === 403) return { state: 'missing' };
        if (!head.ok) throw new Error(`the song file answered ${head.status}`);
        addMusicVideos([song]);
        const a = await waitFor(slot.an, song);
        // the library's music-video flag wins over the analysis's (radio/autodj.ts withFlag)
        const shared = { ...a, musicVideo: !!song.musicVideo, analysisVersion: ANALYSIS_VERSION };
        const put = await fetch(analysisWriteUrl(song.key), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(shared) });
        if (!put.ok) {
          const text = await put.text().catch(() => '');
          // the website refused it (e.g. the song was deleted meanwhile): the song's own fault
          if (put.status >= 400 && put.status < 500) return { state: 'failed', message: text.slice(0, 200) || `refused (${put.status})` };
          throw new Error(`sharing the analysis: ${put.status}`);
        }
        return { state: 'done', ms: performance.now() - started, bpm: a.bpm ?? null };
      } catch (e) {
        // a network fault: the caller pauses and tries the song again
        if (e instanceof TypeError) throw e;
        return { state: 'failed', message: e instanceof Error ? e.message : String(e) };
      } finally {
        slot.an.forget(song.key);
        slot.busy--;
      }
    },
    close() {
      for (const s of slots) s.an.close();
    },
  };
}
