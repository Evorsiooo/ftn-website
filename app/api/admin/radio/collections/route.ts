import { NextRequest, NextResponse } from "next/server";
import { failure, radioAdmin } from "@/lib/radio/admin-route";
import { addToCollection, canSeeAllCollections, collectionOf, collectionOwners, removeFromCollection } from "@/lib/radio/collections";
import { noStore } from "@/lib/radio/store";

export const runtime = "edge";

/**
 * A broadcaster's collection: yours, or (site admins and managers) anyone's with ?user=<id>.
 * ?owners=1: everyone who has a collection and how many songs (yourself only, unless you can see all).
 */
export async function GET(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const all = canSeeAllCollections(ctx.user.roles);
  try {
    if (request.nextUrl.searchParams.get("owners") === "1") {
      const owners = await collectionOwners(ctx.db);
      return NextResponse.json({ owners: all ? owners : owners.filter((o) => o.userId === ctx.user.id), me: ctx.user.id }, { headers: noStore });
    }
    const asked = request.nextUrl.searchParams.get("user");
    const userId = asked && all ? asked : ctx.user.id;
    return NextResponse.json({ userId, ...(await collectionOf(ctx.db, userId)) }, { headers: noStore });
  } catch (err) {
    return failure(err, "Could not load the collection");
  }
}

/** Adds library songs to your collection: { songIds: [...] } (up to 200). Answers how many were new. */
export async function POST(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const body = (await request.json().catch(() => null)) as { songIds?: unknown } | null;
  const songIds = Array.isArray(body?.songIds) ? body.songIds.filter((x): x is string => typeof x === "string") : [];
  if (!songIds.length || songIds.length > 200) return NextResponse.json({ error: "Give 1 to 200 song ids" }, { status: 400 });
  try {
    const added = await addToCollection(ctx.db, ctx.user.id, songIds);
    return NextResponse.json({ ok: true, added, skipped: Math.max(0, new Set(songIds).size - added) });
  } catch (err) {
    return failure(err, "Could not add to your collection");
  }
}

/** Takes a song out of a collection (yours; site admins and managers: anyone's, with userId). */
export async function DELETE(request: NextRequest) {
  const ctx = await radioAdmin(request);
  if ("error" in ctx) return ctx.error;
  const body = (await request.json().catch(() => null)) as { songId?: unknown; userId?: unknown } | null;
  const songId = typeof body?.songId === "string" ? body.songId : "";
  if (!songId) return NextResponse.json({ error: "Missing songId" }, { status: 400 });
  const userId = typeof body?.userId === "string" && canSeeAllCollections(ctx.user.roles) ? body.userId : ctx.user.id;
  try {
    await removeFromCollection(ctx.db, userId, songId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failure(err, "Could not remove the song");
  }
}
