"use client";
// "Find genres and original years" (the Library's ⋯ menu): looks every song that hasn't been looked up yet
// in MusicBrainz (detailed genres and the year it first came out, lib/radio/genres.ts) and, for songs with
// no genre yet, in Apple's catalogue (its broad genre: songs named by YouTube Music's catalogue skip the
// title check, so they get it here). Runs in this browser, only after a click, and can be stopped; songs
// already looked up are skipped, so a stopped run carries on where it was the next time.
// Genres typed in by hand are never touched.
import { useCallback, useEffect, useRef, useState } from "react";
import { CatalogError, findInCatalog } from "@/lib/radio/metadata";
import { lookUpGenres, MB_GAP_MS, mbGate, MusicBrainzBusy } from "@/lib/radio/genres";
import { pacedSearch } from "./metadata-check";
import { api, type Song } from "./types";

export type GenreCheckState = { running: boolean; done: number; total: number; found: number; note: string | null };

const BACKOFF_MS = 60_000;

const sleep = (ms: number, stop: { current: boolean }) =>
  new Promise<void>((resolve) => {
    const end = Date.now() + ms;
    const t = setInterval(() => {
      if (stop.current || Date.now() >= end) {
        clearInterval(t);
        resolve();
      }
    }, 250);
  });

/** The songs a run would look up: not archived, not looked up yet, genres not typed in by hand. */
export const genresToFind = (songs: Song[] | null) => (songs || []).filter((s) => !s.archived && !s.genreCheckedAt && !s.genreByHand);

/** About 3 MusicBrainz requests a song at one a second; Apple's search (one every 3.2 s) runs alongside. */
export const GENRE_SECONDS_PER_SONG = 3 * (MB_GAP_MS / 1000);

export function useGenreCheck(songs: Song[] | null, onPatched: (id: string, patch: Partial<Song>) => void) {
  const [state, setState] = useState<GenreCheckState>({ running: false, done: 0, total: 0, found: 0, note: null });
  const stopRef = useRef(false);
  const busy = useRef(false);

  const run = useCallback(async () => {
    const list = genresToFind(songs);
    if (busy.current || !list.length) return;
    busy.current = true;
    stopRef.current = false;
    let done = 0;
    let found = 0;
    let busyTimes = 0;
    setState({ running: true, done, total: list.length, found, note: null });
    const get = mbGate();
    const search = pacedSearch(stopRef);
    const artistGenres = new Map<string, string[]>();
    try {
      for (const song of list) {
        if (stopRef.current) break;
        const mb = (async () => {
          for (;;) {
            try {
              return await lookUpGenres(song, get, stopRef, artistGenres);
            } catch (err) {
              if (!(err instanceof MusicBrainzBusy) || ++busyTimes > 5) throw err;
              setState((s) => ({ ...s, note: "MusicBrainz asked us to slow down. Carrying on in a minute." }));
              await sleep(BACKOFF_MS, stopRef);
              setState((s) => ({ ...s, note: null }));
              if (stopRef.current) return null;
            }
          }
        })();
        const apple = (async () => {
          if (song.genre || song.source === "upload") return null;
          try {
            return (await search(song.title, song.artist, song.durationSec))?.primaryGenreName?.trim().slice(0, 60) || null;
          } catch (err) {
            // Apple refusing only costs this song its broad genre; the next run tries again
            if (err instanceof CatalogError) return null;
            throw err;
          }
        })();
        const [m, a] = await Promise.all([mb, apple]);
        if (stopRef.current) break;
        const patch: Record<string, unknown> = { genreChecked: true };
        if (m?.genres.length) patch.genres = m.genres;
        // only an earlier year than ours: a later one means MusicBrainz matched a reissue or a bonus-track edition
        if (m?.originalYear && (!song.releaseYear || m.originalYear < song.releaseYear)) patch.originalYear = m.originalYear;
        if (a) patch.genre = a;
        await api(`/api/admin/radio/songs/${song.id}`, { method: "PATCH", body: JSON.stringify(patch) });
        if (m?.genres.length || a) found += 1;
        const local: Partial<Song> = { genreCheckedAt: new Date().toISOString() };
        if (patch.genres) local.genres = JSON.stringify(patch.genres);
        if (patch.originalYear) local.originalYear = patch.originalYear as number;
        if (patch.genre) local.genre = patch.genre as string;
        onPatched(song.id, local);
        done += 1;
        setState((s) => ({ ...s, done, found }));
      }
      setState((s) => ({ ...s, running: false, note: stopRef.current ? "Stopped. The next run carries on from here." : null }));
    } catch (err: any) {
      setState((s) => ({ ...s, running: false, note: `Stopped: ${err?.message || "MusicBrainz didn't answer"}. Try again later; it carries on from here.` }));
    } finally {
      busy.current = false;
    }
  }, [songs, onPatched]);

  useEffect(
    () => () => {
      stopRef.current = true;
    },
    []
  );

  return {
    state,
    run,
    stop: () => {
      stopRef.current = true;
    },
  };
}
