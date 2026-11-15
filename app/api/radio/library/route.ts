import { NextResponse } from "next/server";
import { listAutoDjSongs } from "@/lib/radio/library";
import { radioDb } from "@/lib/radio/store";

export const runtime = "edge";

// PLACEHOLDER: the library branch owns this route and replaces it when the
// two are combined (same response shape).
export async function GET() {
  const db = radioDb();
  const songs = db ? await listAutoDjSongs(db) : [];
  return NextResponse.json({ songs }, { headers: { "Cache-Control": "public, max-age=60" } });
}
