import { NextRequest, NextResponse } from "next/server";
import { radioAdmin } from "@/lib/radio/admin-route";
import { linkKind } from "@/lib/radio/library";

export const runtime = "edge";

/** The downloader reads Spotify's public embed page, which lists only a playlist's first 100 songs. */
const SPOTIFY_LIST_LIMIT = 100;

/**
 * Before an import starts: what kind of link it is and, for a Spotify playlist or album, how many
 * songs Spotify says it has (from the page's music:song_count), so the page can warn when only the
 * first 100 will come in. songCount is null when Spotify doesn't say.
 */
export async function GET(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const url = (request.nextUrl.searchParams.get("url") || "").trim();
  const kind = url.length <= 2000 ? linkKind(url) : null;
  if (!kind) return NextResponse.json({ error: "Paste a YouTube, YouTube Music, SoundCloud or Spotify link." }, { status: 400 });

  let songCount: number | null = null;
  const m = kind.source === "spotify" && kind.collection ? /(playlist|album)[/:]([A-Za-z0-9]{10,40})/.exec(url) : null;
  if (m) {
    try {
      const res = await fetch(`https://open.spotify.com/${m[1]}/${m[2]}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", Accept: "text/html" },
        signal: AbortSignal.timeout(8000),
      });
      const html = res.ok ? await res.text() : "";
      const count = /<meta name="music:song_count" content="(\d+)"/.exec(html);
      if (count) songCount = Number(count[1]);
    } catch {
      // only informative
    }
  }
  return NextResponse.json({ ...kind, songCount, limit: m?.[1] === "playlist" ? SPOTIFY_LIST_LIMIT : null });
}
