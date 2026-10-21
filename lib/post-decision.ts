import { and, eq } from "drizzle-orm";
import { DbClient } from "@/db";
import { posts } from "@/db/schema";
import { publishToFeed, refreshPostMessages } from "@/lib/discord-posts";
import { releaseAdImpression } from "@/lib/posts";

export interface DecisionActor {
  /** Website user id, when the decision was made on the website. */
  userId?: string;
  /** Shown in Discord, e.g. "Carol (website)" or "Dana (Discord)". */
  label: string;
}

export type DecisionResult =
  | { ok: true; warning?: string }
  | { ok: false; status: number; error: string };

// Single place where a post is approved or denied, used by the website and the Discord buttons.
export async function decidePost(
  db: DbClient,
  postId: string,
  decision: "approve" | "deny",
  reason: string,
  actor: DecisionActor
): Promise<DecisionResult> {
  // Only a pending post can be decided, and only once.
  const claimed = await db
    .update(posts)
    .set({
      status: decision === "approve" ? "approved" : "denied",
      denyReason: decision === "deny" ? reason : null,
      decidedBy: actor.userId ?? null,
      decidedByLabel: actor.label,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(posts.id, postId), eq(posts.status, "pending")))
    .returning();
  if (claimed.length === 0) {
    return { ok: false, status: 409, error: "This post was already decided or does not exist" };
  }
  const post = claimed[0];

  if (decision === "deny") {
    // A denied post is never published, so its ad impression is given back.
    await releaseAdImpression(db, post.adId);
  } else {
    try {
      await publishToFeed(db, post);
    } catch (err: any) {
      // Could not publish: undo the approval so it can be tried again.
      console.error("Publishing approved post failed:", err);
      await db
        .update(posts)
        .set({ status: "pending", decidedBy: null, decidedByLabel: null, decidedAt: null, updatedAt: new Date() })
        .where(eq(posts.id, postId));
      return { ok: false, status: 502, error: `Could not post to the feed: ${err?.message || "Discord error"}` };
    }
  }

  const refreshed = await refreshPostMessages(db, postId);
  return refreshed.ok ? { ok: true } : { ok: true, warning: refreshed.error };
}
