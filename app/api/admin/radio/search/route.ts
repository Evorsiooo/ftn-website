import { NextRequest, NextResponse } from "next/server";
import { failure, radioAdmin } from "@/lib/radio/admin-route";
import { searchMusic } from "@/lib/radio/library";

export const runtime = "edge";

/**
 * GET ?q=<words>: live YouTube Music song search for Add songs (Library, Studio, MCP). The VPS does the
 * search; this reads no songs table, only the sign-in and the downloader's settings row.
 */
export async function GET(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const q = (request.nextUrl.searchParams.get("q") || "").trim().replace(/\s+/g, " ");
  if (q.length < 2 || q.length > 200) return NextResponse.json({ error: "Type at least 2 characters." }, { status: 400 });
  try {
    const { songs } = await searchMusic(ctx.db, q);
    return NextResponse.json({ songs: songs || [] }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    return failure(err, "Could not search YouTube Music");
  }
}
