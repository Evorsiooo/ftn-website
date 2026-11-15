/**
 * The providers' one way out, after BitChord's http.ts: a GET that answers with the body or null, never an
 * exception. Hosts that allow cross-site requests are asked directly; the ones that don't (BitChord reaches them
 * through its browser extension) go through the website's lyrics proxy, /api/radio/lyrics, which passes the
 * Authorization header on and adds the headers BitChord's extension adds.
 */

/** Hosts a page can't reach itself (BitChord's LYRIC_EXTENSION_ORIGINS, without Genius). */
export const LYRIC_PROXY_ORIGINS = [
  'https://mobileservice.kugou.com',
  'https://lyrics.kugou.com',
  'https://apic.musixmatch.com',
  'https://www.musixmatch.com',
  'https://music.apple.com',
  'https://amp-api.music.apple.com',
  'https://api.paxsenix.org',
  'https://lyrics-api.boidu.dev',
  'https://unison.boidu.dev',
];

const DIRECT_TIMEOUT_MS = 6000;
const PROXY_TIMEOUT_MS = 15_000;
const PROXY = '/api/radio/lyrics';

export interface GetOptions {
  route?: 'direct' | 'extension';
  headers?: Record<string, string>;
  /** Longer deadline for authenticated routes that look things up upstream (PaxSenix). */
  patient?: boolean;
}

async function viaProxy(url: string, headers: Record<string, string> | undefined): Promise<string | null> {
  if (!LYRIC_PROXY_ORIGINS.includes(new URL(url).origin)) return null;
  try {
    const auth = headers?.Authorization ?? headers?.authorization;
    const response = await fetch(`${PROXY}?url=${encodeURIComponent(url)}`, {
      headers: auth ? { Authorization: auth } : undefined,
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

export async function lyricsGet(url: string, { route = 'direct', headers, patient }: GetOptions = {}): Promise<string | null> {
  if (route === 'extension') return viaProxy(url, headers);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json, text/plain, */*', ...headers },
      signal: AbortSignal.timeout(patient ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS),
      referrerPolicy: 'no-referrer',
    });
    return response.ok ? await response.text() : null;
  } catch (error) {
    // A CORS refusal looks like a network error from here; the proxy isn't bound by it.
    if (error instanceof TypeError) return viaProxy(url, headers);
    return null;
  }
}

/** A URL with query parameters, skipping empty ones. */
export function urlWith(base: string, params: Record<string, string | number | null | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}
