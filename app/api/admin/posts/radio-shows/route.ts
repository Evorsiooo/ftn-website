import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, isNotNull, like, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, radioReplayParts, radioReplays, radioShows, users } from "@/db/schema";
import { requireStaff } from "@/lib/admin-auth";
import { canManagePosts } from "@/lib/rbac";
import { parseRadioClipEdit } from "@/lib/radio-clips/model";

export const runtime = "edge";

/**
 * Shows that can be clipped: every finished replay that is on FTN+ (a clip links to it), newest
 * first, with who was heard on it and how many clip posts were already made from it.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaff(request, canManagePosts, "Forbidden: Staff permissions required");
  if ("error" in auth) return auth.error;
  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return NextResponse.json({ shows: [] });
  const db = getDb(d1);
  const rows = await db
    .select({ r: radioReplays, showName: radioShows.name, showArt: radioShows.artUrl })
    .from(radioReplays)
    .leftJoin(radioShows, eq(radioShows.id, radioReplays.showId))
    .where(and(eq(radioReplays.hidden, false), isNotNull(radioReplays.endedAt), lt(radioReplays.endedAt, new Date())))
    .orderBy(desc(radioReplays.startedAt))
    .limit(100);
  const ids = rows.map((r) => r.r.id);
  const heard = ids.length
    ? await db
        .selectDistinct({ replayId: radioReplayParts.replayId, userId: radioReplayParts.userId, name: users.robloxUsername, avatar: users.avatarUrl })
        .from(radioReplayParts)
        .innerJoin(users, eq(users.id, radioReplayParts.userId))
        .where(and(inArray(radioReplayParts.replayId, ids), eq(radioReplayParts.kind, "voice")))
    : [];
  const clipRows = await db
    .select({ edit: posts.videoEdit, status: posts.status })
    .from(posts)
    .where(like(posts.videoEdit, '%"v":"radio"%'));
  // clips already posted (approved) and still in progress (drafts and posts waiting for approval)
  const clips = new Map<string, { posted: number; inProgress: number }>();
  for (const c of clipRows) {
    const e = parseRadioClipEdit(c.edit);
    if (!e || c.status === "denied") continue;
    const n = clips.get(e.replayId) ?? { posted: 0, inProgress: 0 };
    if (c.status === "approved") n.posted++;
    else n.inProgress++;
    clips.set(e.replayId, n);
  }
  return NextResponse.json({
    shows: rows.map(({ r, showName, showArt }) => ({
      id: r.id,
      title: r.title,
      show: showName ?? null,
      art: r.artUrl ?? showArt ?? null,
      startedAt: r.startedAt.getTime(),
      endedAt: r.endedAt!.getTime(),
      people: heard.filter((h) => h.replayId === r.id).map((h) => ({ userId: h.userId, name: h.name, avatar: h.avatar })),
      clips: clips.get(r.id) ?? { posted: 0, inProgress: 0 },
    })),
  });
}
