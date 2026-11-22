"use client";
/**
 * Apple Music's animated covers for the radio: BitChord's web/app/src/data/apple/motionArt.ts, line for line,
 * with three differences that come from the website rather than the code:
 * - Apple's catalogue is read through the website's proxy (/api/radio/lyrics), which is what BitChord's
 *   extension does for it; so there is no "permission granted, look again" hook (onGranted).
 * - The query cache is a small one of its own with react-query's settings from BitChord (kept forever once
 *   found, dropped 30 minutes after nothing shows it, no retry), as the site doesn't use react-query.
 * - BitChord's "Apple Music motion" switch lives on its settings page; the radio has no settings page, so
 *   it is on, as BitChord's default. Reduced motion and metered connections still turn it off, as there.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { lyricsGet, urlWith } from '@/radio-engine/src/lyrics/http';
import { obj, parse, str, type Json } from './json';
import { albumIdOf, isCompilation, matches, motionUrls, ranked, songTerm, type AppleMotion } from './motion';
import { appleWebToken } from './webToken';

export type { AppleMotion };

const AMP = 'https://amp-api.music.apple.com/v1/catalog';

/** Motion artwork is per storefront: the browser's region when it names one (Cloudflare's server has a navigator without a language). */
const storefront = (() => {
  const region = typeof navigator === 'undefined' ? '' : (navigator.language?.split('-')[1] ?? '');
  return /^[a-z]{2}$/i.test(region) ? region.toLowerCase() : 'us';
})();

/** An authenticated catalogue read, through the extension (Apple sends no CORS headers). */
async function catalog(path: string, params: Record<string, string | number>): Promise<Json | null> {
  const token = await appleWebToken();
  if (!token) throw new Error('Apple Music is out of reach');
  const body = await lyricsGet(urlWith(`${AMP}/${storefront}/${path}`, params), {
    route: 'extension',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (body === null) throw new Error('Apple Music catalogue read failed');
  return obj(parse(body));
}

const hitsOf = (root: Json | null, type: string): Json[] =>
  ((obj(obj(root?.results)?.[type])?.data as Json[] | undefined) ?? []).filter((h): h is Json => !!obj(h));

/**
 * The motion artwork for a track (AppleMusicCanvas.search): a scored song
 * search, then the clip inline on the hit or on its album. Null when Apple has
 * none that clears the bar.
 */
export async function fetchTrackMotion(title: string, artist: string, album: string | null): Promise<AppleMotion | null> {
  const root = await catalog('search', {
    term: songTerm(title, artist, album),
    types: 'songs',
    limit: 10,
    extend: 'editorialVideo',
    include: 'albums',
  });
  for (const song of ranked(hitsOf(root, 'songs'), title, artist, album)) {
    const attributes = obj(song.attributes);
    const found = { title: str(attributes?.name) || null, artist: str(attributes?.artistName) || null, album: str(attributes?.albumName) || null };
    // Some searches carry the clip inline, which saves the album round trip.
    const inline = motionUrls(attributes?.editorialVideo);
    if (inline && matches(found, title, artist, album)) return inline;

    const albumId = albumIdOf(song);
    if (!albumId) continue;
    const record = obj(((await catalog(`albums/${albumId}`, { extend: 'editorialVideo' }))?.data as Json[] | undefined)?.[0]);
    const albumAttributes = obj(record?.attributes);
    const albumName = str(albumAttributes?.name);
    if (!albumAttributes || isCompilation(albumName)) continue;
    const motion = motionUrls(albumAttributes.editorialVideo);
    if (motion && matches({ ...found, album: albumName || found.album }, title, artist, album)) return motion;
  }
  return null;
}

/** The motion artwork for a release (AppleMusicCanvas.searchAlbum): albums carry it inline. */
export async function fetchAlbumMotion(album: string, artist: string): Promise<AppleMotion | null> {
  const term = album.toLowerCase().includes(artist.toLowerCase()) ? album : `${artist} ${album}`;
  const root = await catalog('search', { term, types: 'albums', limit: 10, extend: 'editorialVideo' });
  for (const record of ranked(hitsOf(root, 'albums'), album, artist, album, true)) {
    const attributes = obj(record.attributes);
    const name = str(attributes?.name);
    if (!attributes || isCompilation(name)) continue;
    const motion = motionUrls(attributes.editorialVideo);
    if (motion && matches({ title: name, artist: str(attributes.artistName) || null, album: name }, album, artist, album)) return motion;
  }
  return null;
}

// ------------------------------------------------------------- BitChord's data/spotify/canvas.ts gates

const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      reducedMotion?.addEventListener('change', onChange);
      return () => reducedMotion?.removeEventListener('change', onChange);
    },
    () => reducedMotion?.matches ?? false,
    () => false,
  );
}

/** Save-Data, or a cellular link where the browser says so (Network Information API, Chromium only). */
export function metered(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; type?: string } }).connection;
  return !!connection?.saveData || connection?.type === 'cellular';
}

/** Whether a clip may be looked up and shown at all: the setting on, motion allowed, not metered. */
function useMotionAllowed(): boolean {
  const enabled = true;
  const still = useReducedMotion();
  const [notMetered, setNotMetered] = useState(false);
  useEffect(() => setNotMetered(!metered()), []);
  return enabled && !still && notMetered;
}

// ------------------------------------------------- the query cache (BitChord: useQuery with QUERY below)

const QUERY = { staleTime: Infinity, gcTime: 30 * 60_000, retry: false } as const;

type Entry = { promise: Promise<AppleMotion | null>; data?: AppleMotion | null; users: number; gc?: ReturnType<typeof setTimeout> };
const queries = new Map<string, Entry>();

function useMotionQuery(key: string, enabled: boolean, fetch: () => Promise<AppleMotion | null>): AppleMotion | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let entry = queries.get(key);
    if (!entry) {
      const created: Entry = { promise: fetch(), users: 0 };
      created.promise.then(
        (data) => (created.data = data),
        // no retry; nothing is kept, so the next time it is shown it is asked again
        () => queries.get(key) === created && !created.users && queries.delete(key),
      );
      queries.set(key, created);
      entry = created;
    }
    const e = entry;
    e.users++;
    if (e.gc) clearTimeout(e.gc);
    let alive = true;
    void e.promise.then(
      () => alive && setTick((t) => t + 1),
      () => undefined,
    );
    return () => {
      alive = false;
      e.users--;
      if (!e.users) e.gc = setTimeout(() => queries.get(key) === e && queries.delete(key), QUERY.gcTime);
    };
  }, [key, enabled]);
  return enabled ? (queries.get(key)?.data ?? null) : null;
}

/** Apple's animated sleeve for a track; null until (and unless) one is found. */
export function useTrackMotion(title: string | null | undefined, artist: string | null | undefined, album: string | null | undefined) {
  const allowed = useMotionAllowed();
  const data = useMotionQuery(
    JSON.stringify(['apple', 'motion', 'track', title ?? '', artist ?? '', album ?? '']),
    allowed && !!title?.trim() && !!artist?.trim(),
    () => fetchTrackMotion(title!, artist!, album ?? null),
  );
  return allowed ? data : null;
}

/** Apple's animated cover for an album page; null until (and unless) one is found. */
export function useAlbumMotion(album: string | null | undefined, artist: string | null | undefined) {
  const allowed = useMotionAllowed();
  const data = useMotionQuery(
    JSON.stringify(['apple', 'motion', 'album', album ?? '', artist ?? '']),
    allowed && !!album?.trim() && !!artist?.trim(),
    () => fetchAlbumMotion(album!, artist!),
  );
  return allowed ? data : null;
}
