import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Lyrics proxy for the radio player: BitChord's lyric providers that a web page can't reach itself
 * (no CORS headers, or headers a page can't set). In BitChord its browser extension does this
 * (web/extension/lib/lyricsFetch.ts); here the website does it, for the same hosts and with the
 * same extra headers, except Genius (it refuses Cloudflare, and the VPS only downloads songs, so
 * there is no fallback). GET only, other hosts refused, redirects only within the list. Answers
 * without an Authorization header are kept in the edge cache for a day.
 *
 * Use: GET /api/radio/lyrics?url=<encoded URL>, optionally with an Authorization header, which is
 * passed on (PaxSenix and Apple Music tokens, as in BitChord's providers).
 */
// BitChord's extension hosts (web/extension/lib/lyricHosts.ts LYRIC_ORIGINS), without Genius: the ones a page
// can never reach itself, and the ones that refuse some sites (radio-engine/src/lyrics/http.ts falls back to here).
const ORIGINS = new Set([
  "https://lrc.red",
  "https://lyrics-api.binimum.org",
  "https://lyrics-api.boidu.dev",
  "https://unison.boidu.dev",
  "https://lyrics.paxsenix.org",
  "https://api.paxsenix.org",
  "https://lyricsplus.prjktla.my.id",
  "https://lyricsplus.atomix.one",
  "https://lyricsplus.binimum.org",
  "https://lyricsplus.prjktla.workers.dev",
  "https://lyricsplus-seven.vercel.app",
  "https://lyrics-plus-backend.vercel.app",
  "https://lrclib.net",
  "https://mobileservice.kugou.com",
  "https://lyrics.kugou.com",
  "https://apic.musixmatch.com",
  "https://www.musixmatch.com",
  "https://music.apple.com",
  "https://amp-api.music.apple.com",
]);

/** BitChord's extension rules (lyricsFetch.ts RULES). */
function extraHeaders(url: URL): Record<string, string> {
  if (url.hostname === "amp-api.music.apple.com") return { Origin: "https://music.apple.com", Referer: "https://music.apple.com/" };
  if (url.hostname.endsWith("musixmatch.com")) return { Cookie: "mxm_bab=AB" };
  return {};
}

const TTL_SECONDS = 24 * 3600;

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url") || "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Bad url" }, { status: 400 });
  }
  if (!ORIGINS.has(target.origin) || target.username || target.password) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  const auth = request.headers.get("authorization");
  const cache = !auth ? (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default : undefined;
  const cacheKey = new Request(`https://lyrics-proxy.internal/${encodeURIComponent(target.toString())}`);
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;

  let res: Response;
  try {
    let url = target;
    // follow redirects by hand so they can't leave the list
    for (let hop = 0; ; hop++) {
      res = await fetch(url.toString(), {
        headers: {
          Accept: request.headers.get("accept") || "application/json, text/plain, */*",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
          ...(auth ? { Authorization: auth } : {}),
          ...extraHeaders(url),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!location) break;
      const next = new URL(location, url);
      if (!ORIGINS.has(next.origin) || hop >= 3) return NextResponse.json({ error: "Redirect not allowed" }, { status: 502 });
      url = next;
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Lyrics host unreachable" }, { status: 502 });
  }

  const body = await res.arrayBuffer();
  const out = new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "text/plain; charset=utf-8",
      "Cache-Control": res.ok && !auth ? `public, max-age=${TTL_SECONDS}` : "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
  if (cache && res.ok) await cache.put(cacheKey, out.clone()).catch(() => {});
  return out;
}
