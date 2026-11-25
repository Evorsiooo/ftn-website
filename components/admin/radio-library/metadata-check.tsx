"use client";
// Looks songs up in Apple's music catalog from this browser (iTunes Search allows it, and each admin's own
// connection keeps well inside its ~20 searches a minute) and saves the exact title, artist, album, year and
// square cover. New songs are checked as part of Prepare (prepare-run.ts, only after a click); "Re-check all
// titles and covers" goes through the whole library. A song is changed only when the catalog has the same song at the same length.
// Songs named by YouTube Music's catalogue (the album-audio check, metadataSource "ytmusic") are left
// alone: as in BitChord, those names come first and this lookup is the fallback.
import { useCallback, useEffect, useRef, useState } from "react";
import { CatalogError, findInCatalog, guessTitleArtist, tidyName } from "@/lib/radio/metadata";
import { api, type Song } from "./types";

const GAP_MS = 3200; // one search every 3.2 s: under Apple's limit
const BACKOFF_MS = 60_000;
const TRIED_KEY = "ftn_radio_meta_tried";


function readTried(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(TRIED_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function markTried(id: string) {
  try {
    const t = readTried();
    t[id] = Date.now();
    localStorage.setItem(TRIED_KEY, JSON.stringify(t));
  } catch {}
}

export type CheckState = { running: boolean; all: boolean; done: number; total: number; updated: number; note: string | null };

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

type Searchable = Pick<Song, "title" | "artist" | "durationSec" | "album" | "releaseYear" | "thumbnail">;
type Search = (title: string, artist: string, dur: number) => ReturnType<typeof findInCatalog>;

/**
 * What the catalog says should change for [song] (exact title, artist, album, year, square cover), or null when
 * it has nothing (no match, or nothing different). The title as stored is tried first; then, for older songs,
 * "Artist - Title (Official Video)" split up. [onRefused] is asked whether to wait a minute and try once more
 * when the catalog asks us to slow down (false: give up, the error is thrown).
 */
export async function catalogPatch(song: Searchable, search: Search, stop: { current: boolean }, onRefused: () => boolean): Promise<Record<string, unknown> | null> {
  const tries = [{ title: song.title, artist: song.artist }];
  const guess = guessTitleArtist({ title: song.title, artist: song.artist, durationSec: song.durationSec });
  if (guess.title !== song.title || guess.artist !== song.artist) tries.push({ title: guess.title, artist: guess.artist });
  let hit = null;
  for (const t of tries) {
    if (stop.current) return null;
    try {
      hit = await search(t.title, t.artist, song.durationSec);
    } catch (err) {
      if (!(err instanceof CatalogError) || !onRefused()) throw err;
      await sleep(BACKOFF_MS, stop);
      hit = await search(t.title, t.artist, song.durationSec).catch(() => null);
    }
    if (hit) break;
  }
  if (!hit) return null;
  const year = hit.releaseDate ? Number(hit.releaseDate.slice(0, 4)) : NaN;
  const patch: Record<string, unknown> = {};
  const title = tidyName(hit.trackName);
  if (title !== song.title) patch.title = title;
  if (hit.artistName !== song.artist) patch.artist = hit.artistName;
  if (hit.collectionName && tidyName(hit.collectionName) !== song.album) patch.album = tidyName(hit.collectionName);
  if (Number.isFinite(year) && year !== song.releaseYear) patch.releaseYear = year;
  const art = hit.artworkUrl100?.startsWith("https://") ? hit.artworkUrl100.replace(/\/\d+x\d+bb\./, "/600x600bb.") : null;
  if (art && art !== song.thumbnail) patch.thumbnail = art;
  return Object.keys(patch).length ? patch : null;
}

/** Searches the catalog no more than once every 3.2 s (Apple's limit), however many callers share it. */
export function pacedSearch(stop: { current: boolean }): Search {
  let lastSearch = 0;
  return async (title, artist, dur) => {
    const wait = lastSearch + GAP_MS - Date.now();
    lastSearch = Math.max(Date.now(), lastSearch + GAP_MS);
    await sleep(Math.max(0, wait), stop);
    return findInCatalog(title, artist, dur);
  };
}

// onPatched updates the one song in the page's list: reloading the whole library after every match
// cost the server more than its free-plan CPU allowance once the library grew past a thousand songs.
export function useMetadataCheck(songs: Song[] | null, onPatched: (id: string, patch: Partial<Song>) => void) {
  const [state, setState] = useState<CheckState>({ running: false, all: false, done: 0, total: 0, updated: 0, note: null });
  const stopRef = useRef(false);
  const busy = useRef(false);

  const check = useCallback(
    async (list: Song[], all: boolean) => {
      if (busy.current || !list.length) return;
      busy.current = true;
      stopRef.current = false;
      let done = 0;
      let updated = 0;
      let refusals = 0;
      setState({ running: true, all, done, total: list.length, updated, note: null });
      let lastSearch = 0;
      const search = async (title: string, artist: string, dur: number) => {
        await sleep(Math.max(0, lastSearch + GAP_MS - Date.now()), stopRef);
        lastSearch = Date.now();
        return findInCatalog(title, artist, dur);
      };
      try {
        for (const song of list) {
          if (stopRef.current) break;
          const patch = await catalogPatch(song, search, stopRef, () => {
            if (++refusals > 3) return false;
            setState((st) => ({ ...st, note: "The catalog asked us to slow down. Carrying on in a minute." }));
            return true;
          });
          setState((st) => (st.note ? { ...st, note: null } : st));
          if (stopRef.current) break;
          markTried(song.id);
          if (patch) {
            await api(`/api/admin/radio/songs/${song.id}`, { method: "PATCH", body: JSON.stringify(patch) });
            updated += 1;
            onPatched(song.id, patch as Partial<Song>);
          }
          done += 1;
          setState((s) => ({ ...s, done, updated }));
        }
        setState((s) => ({ ...s, running: false, note: stopRef.current ? "Stopped." : null }));
      } catch (err: any) {
        setState((s) => ({ ...s, running: false, note: `Stopped: ${err?.message || "the catalog didn't answer"}. Try again later.` }));
      } finally {
        busy.current = false;
      }
    },
    [onPatched]
  );

  useEffect(
    () => () => {
      stopRef.current = true;
    },
    []
  );

  return {
    state,
    /**
     * Every song that came from a link (uploads keep what was typed in), except the ones named by
     * YouTube Music's catalogue (their album song, as BitChord names it): the catalog is the fallback.
     */
    recheckAll: () => songs && void check(songs.filter((s) => s.source !== "upload" && s.metadataSource !== "ytmusic"), true),
    stop: () => {
      stopRef.current = true;
    },
  };
}
