import { and, eq } from "drizzle-orm";
import { DbClient } from "@/db";
import { posts } from "@/db/schema";
import { dispatchScheduledPost, publishToFeed, refreshPostMessages } from "@/lib/discord-posts";
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

// The scheduled job may have sent the post between reading it and recording the decision.
async function stillScheduled(db: DbClient, postId: string): Promise<boolean> {
  const rows = await db.select({ scheduledAt: posts.scheduledAt }).from(posts).where(eq(posts.id, postId)).limit(1);
  return !!rows[0]?.scheduledAt;
}

// Single place where a post is approved or denied, used by the website and the Discord buttons.
export async function decidePost(
  db: DbClient,
  postId: string,
  decision: "approve" | "deny",
  reason: string,
  actor: DecisionActor
): Promise<DecisionResult> {
  // A post that is still waiting for its publish time has no Discord messages yet. Deciding it
  // only records the decision: a denied post is never sent, an approved one is posted to its
  // feed at its scheduled time (right away when that time has already passed).
  const waiting = await db.select({ scheduledAt: posts.scheduledAt }).from(posts).where(eq(posts.id, postId)).limit(1);
  const scheduledAt = waiting[0]?.scheduledAt ?? null;
  // Only a pending post can be decided, and only once.
  const claimed = await db
    .update(posts)
    .set({
      status: decision === "approve" ? "approved" : "denied",
      denyReason: decision === "deny" ? reason : null,
      ...(scheduledAt && decision === "deny" ? { scheduledAt: null } : {}),
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
  } else if (scheduledAt && (await stillScheduled(db, postId))) {
    if (scheduledAt.getTime() <= Date.now()) {
      const sent = await dispatchScheduledPost(db, postId);
      if (!sent.ok) return { ok: true, warning: `Approved, but it could not be sent yet: ${sent.error}` };
    }
    return { ok: true };
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

  const refreshed = await refreshPostMessages(db, postId, { leadership: true });
  return refreshed.ok ? { ok: true } : { ok: true, warning: refreshed.error };
}
