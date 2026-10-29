import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { DbClient } from "@/db";
import { posts, users } from "@/db/schema";
import {
  DiscordError,
  DiscordFile,
  FEED_CHANNELS,
  FTN_PLUS_CHANNEL_ID,
  FTN_PLUS_EMOJI,
  LEADERSHIP_CHANNEL_ID,
  LEADERSHIP_ROLE_ID,
  discordApi,
  siteUrl,
} from "@/lib/discord";
import { RO_STATES } from "@/lib/ro-states";

type Post = typeof posts.$inferSelect;

const HOUR_MS = 60 * 60 * 1000;

// "an hour ago", "5 hours ago", "a day ago", "3 days ago".
export function roughAgo(ms: number): string {
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 24) return hours <= 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "a day ago" : `${days} days ago`;
}

// The FTN+ line is only added when approval took more than an hour after the post was made.
export function timedExclusiveLine(createdAt: Date, publishedAt: Date): string | null {
  const waited = publishedAt.getTime() - createdAt.getTime();
  if (waited <= HOUR_MS) return null;
  return `${FTN_PLUS_EMOJI} FTN+ Timed exclusive. (Published in our server ${roughAgo(waited)})`;
}

function learnMoreLine(post: Post): string | null {
  if (!post.organizationName || !post.messageLink) return null;
  return `🔗  Learn more about ${post.organizationName}\n${post.messageLink}`;
}

export function amendmentsOf(post: Post): string[] {
  try {
    const list = JSON.parse(post.amendments || "[]");
    return Array.isArray(list) ? list.filter((n) => typeof n === "string") : [];
  } catch {
    return [];
  }
}

// The post image (or, for a video post, the MP4) as bytes, read straight from R2 when
// possible. It is uploaded with each message, so the message is a plain text-and-file message.
// A video is at most 20 MB, which a Worker can hold in memory.
async function loadPostMedia(post: Post): Promise<DiscordFile> {
  const isVideo = post.mediaType === "video" && !!post.videoUrl;
  const url = isVideo ? post.videoUrl! : post.imageUrl;
  const ext = url.split(".").pop();
  const name = isVideo ? (ext === "webm" ? "post.webm" : ext === "webp" ? "post.webp" : "post.mp4") : "post.png";
  const type = isVideo ? (ext === "webm" ? "video/webm" : ext === "webp" ? "image/webp" : "video/mp4") : "image/png";
  const key = url.replace(/^\/api\/media\//, "");
  const bucket = ((process.env as any).ftn_media as R2Bucket) || ((process.env as any).MEDIA_BUCKET as R2Bucket);
  if (bucket && key !== url) {
    const object = await bucket.get(key);
    if (object) return { name, data: await object.arrayBuffer(), type };
  }
  const res = await fetch(`${siteUrl()}${url}`);
  if (!res.ok) throw new DiscordError(502, `Could not read the post ${isVideo ? "video" : "image"} (${res.status})`);
  return { name, data: await res.arrayBuffer(), type };
}

// The message people see (FTN+ channel and feeds): the optional timed-exclusive line, the
// Learn more line and any edit notes as normal text, with the image attached.
export function buildPostMessage(post: Post, timedLine: string | null = null, amendments: string[] = []) {
  const lines: string[] = [];
  if (timedLine) lines.push(timedLine, "");
  const learnMore = learnMoreLine(post);
  if (learnMore) lines.push(learnMore);
  for (const note of amendments) lines.push("", `*edit: ${note}*`);
  return { content: lines.join("\n").trim(), allowed_mentions: { parse: [] as string[] } };
}

function stateLabel(post: Post): string {
  return RO_STATES.find((s) => s.key === post.roState)?.label ?? post.roState;
}

// The review message in #leadership. While pending it carries the Approve and Deny buttons.
// `ping` is only set on the first send, so later edits never ping the role again.
export function buildLeadershipMessage(post: Post, creatorName: string | null, ping = false) {
  const lines = [
    ping ? `<@&${LEADERSHIP_ROLE_ID}>` : "",
    `**New post for review** · ${stateLabel(post)} · by ${creatorName || "unknown"}`,
    `**${post.headline}**`,
    post.organizationName ? `Ad: ${post.organizationName}` : post.noAd ? "No ad" : "No ad (boilerplate)",
  ];
  if (post.status === "approved") lines.push("", `✅ Approved by ${post.decidedByLabel || "leadership"}`);
  if (post.status === "denied") lines.push("", `❌ Denied by ${post.decidedByLabel || "leadership"}: ${post.denyReason || "no reason given"}`);

  const components =
    post.status === "pending"
      ? [
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: "Approve", custom_id: `post:approve:${post.id}` },
              { type: 2, style: 4, label: "Deny", custom_id: `post:deny:${post.id}` },
            ],
          },
        ]
      : [];
  return {
    content: lines.filter((l, i) => l !== "" || i > 0).join("\n").trim(),
    components,
    allowed_mentions: ping ? { parse: [] as string[], roles: [LEADERSHIP_ROLE_ID] } : { parse: [] as string[] },
  };
}

async function creatorName(db: DbClient, userId: string): Promise<string | null> {
  const rows = await db.select({ name: users.displayName }).from(users).where(eq(users.id, userId)).limit(1);
  return rows[0]?.name ?? null;
}

async function reload(db: DbClient, id: string): Promise<Post> {
  const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
  return rows[0];
}

// Sends whichever of the FTN+ and #leadership messages do not exist yet.
export async function sendPostToDiscord(db: DbClient, postId: string): Promise<{ ok: boolean; error?: string }> {
  let post = await reload(db, postId);
  try {
    if (!post.ftnPlusMessageId) {
      const image = await loadPostMedia(post);
      const msg = await discordApi(
        "POST",
        `/channels/${FTN_PLUS_CHANNEL_ID}/messages`,
        { ...buildPostMessage(post, null, amendmentsOf(post)), attachments: [{ id: 0, filename: image.name }] },
        [image]
      );
      await db.update(posts).set({ ftnPlusMessageId: msg.id }).where(eq(posts.id, postId));
    }
    post = await reload(db, postId);
    if (!post.leadershipMessageId) {
      const image = await loadPostMedia(post);
      const msg = await discordApi(
        "POST",
        `/channels/${LEADERSHIP_CHANNEL_ID}/messages`,
        {
          // Only a post still waiting for a decision pings leadership.
          ...buildLeadershipMessage(post, await creatorName(db, post.createdBy), post.status === "pending"),
          attachments: [{ id: 0, filename: image.name }],
        },
        [image]
      );
      await db.update(posts).set({ leadershipMessageId: msg.id }).where(eq(posts.id, postId));
    }
    return { ok: true };
  } catch (err: any) {
    console.error("sendPostToDiscord failed:", err);
    return { ok: false, error: err?.message || "Discord request failed" };
  }
}

// Posts the approved post in its feed and publishes it (the announcement channel button).
// Throws if the feed message cannot be sent, so the caller can undo the approval.
export async function publishToFeed(db: DbClient, post: Post): Promise<void> {
  const channelId = FEED_CHANNELS[post.roState];
  if (!channelId) throw new DiscordError(400, `No feed channel for ${post.roState}`);

  const timedLine = timedExclusiveLine(post.createdAt, new Date());
  const image = await loadPostMedia(post);
  const msg = await discordApi(
    "POST",
    `/channels/${channelId}/messages`,
    { ...buildPostMessage(post, timedLine, amendmentsOf(post)), attachments: [{ id: 0, filename: image.name }] },
    [image]
  );
  await db.update(posts).set({ feedChannelId: channelId, feedMessageId: msg.id }).where(eq(posts.id, post.id));

  try {
    await discordApi("POST", `/channels/${channelId}/messages/${msg.id}/crosspost`);
  } catch (err) {
    // Not an announcement channel, or already published: the post is out either way.
    console.error("Crosspost failed:", err);
  }
}

type RefreshWhich = { ftnPlus?: boolean; leadership?: boolean; feed?: boolean; image?: boolean };

// Brings the existing Discord messages in line with the post. Only the messages named in
// `which` are edited, so a message that did not change is never marked as edited. With
// `image`, the attached image is replaced too.
export async function refreshPostMessages(
  db: DbClient,
  postId: string,
  which: RefreshWhich = { ftnPlus: true, leadership: true, feed: true }
): Promise<{ ok: boolean; error?: string }> {
  const post = await reload(db, postId);
  try {
    const amendments = amendmentsOf(post);
    const image = which.image ? await loadPostMedia(post) : null;
    const withImage = (body: object) =>
      image ? { ...body, attachments: [{ id: 0, filename: image.name }] } : body;
    const files = image ? [image] : undefined;

    if (which.ftnPlus && post.ftnPlusMessageId) {
      await discordApi(
        "PATCH",
        `/channels/${FTN_PLUS_CHANNEL_ID}/messages/${post.ftnPlusMessageId}`,
        withImage(buildPostMessage(post, null, amendments)),
        files
      );
    }
    if (which.leadership && post.leadershipMessageId) {
      await discordApi(
        "PATCH",
        `/channels/${LEADERSHIP_CHANNEL_ID}/messages/${post.leadershipMessageId}`,
        withImage(buildLeadershipMessage(post, await creatorName(db, post.createdBy))),
        files
      );
    }
    if (which.feed && post.feedMessageId && post.feedChannelId) {
      await discordApi(
        "PATCH",
        `/channels/${post.feedChannelId}/messages/${post.feedMessageId}`,
        withImage(buildPostMessage(post, timedExclusiveLine(post.createdAt, post.decidedAt ?? new Date()), amendments)),
        files
      );
    }
    return { ok: true };
  } catch (err: any) {
    console.error("refreshPostMessages failed:", err);
    return { ok: false, error: err?.message || "Discord request failed" };
  }
}

// Removes every Discord message of the post. A message that is already gone is fine.
export async function deletePostMessages(post: Post): Promise<{ ok: boolean; error?: string }> {
  const targets: [string, string | null][] = [
    [FTN_PLUS_CHANNEL_ID, post.ftnPlusMessageId],
    [LEADERSHIP_CHANNEL_ID, post.leadershipMessageId],
    [post.feedChannelId || "", post.feedMessageId],
  ];
  let error: string | undefined;
  for (const [channelId, messageId] of targets) {
    if (!channelId || !messageId) continue;
    try {
      await discordApi("DELETE", `/channels/${channelId}/messages/${messageId}`);
    } catch (err: any) {
      if (err instanceof DiscordError && err.status === 404) continue;
      console.error("Delete Discord message failed:", err);
      error = err?.message || "Discord request failed";
    }
  }
  return error ? { ok: false, error } : { ok: true };
}

// Sends a scheduled post to Discord now. Claiming the post first (clearing scheduledAt) makes
// sure two runs never send it twice; if Discord fails the post is put back on the schedule
// so the next run tries again. The timed-exclusive clock starts from this moment.
// A post that leadership already approved on the website is posted to its feed as well, and its
// #leadership message carries no buttons; a denied post is never scheduled any more.
export async function dispatchScheduledPost(db: DbClient, postId: string): Promise<{ ok: boolean; error?: string }> {
  const claimed = await db
    .update(posts)
    .set({ scheduledAt: null, createdAt: new Date(), updatedAt: new Date() })
    .where(and(eq(posts.id, postId), isNotNull(posts.scheduledAt), inArray(posts.status, ["pending", "approved"])))
    .returning({ id: posts.id, scheduledAt: posts.scheduledAt });
  if (claimed.length === 0) return { ok: false, error: "This post is not scheduled" };
  let result = await sendPostToDiscord(db, postId);
  if (result.ok) {
    const post = await reload(db, postId);
    if (post.status === "approved" && !post.feedMessageId) {
      try {
        await publishToFeed(db, post);
      } catch (err: any) {
        console.error("Publishing scheduled approved post failed:", err);
        result = { ok: false, error: `Could not post to the feed: ${err?.message || "Discord error"}` };
      }
    }
  }
  if (!result.ok) {
    // Partial sends are fine: only the messages that are missing are created on the next run.
    await db.update(posts).set({ scheduledAt: new Date() }).where(eq(posts.id, postId));
  }
  return result;
}

// Sends every scheduled post whose time has come. Called by the scheduled job and, as a safety
// net, whenever staff load the Posts page (GitHub's scheduler can run hours apart).
export async function dispatchDuePosts(db: DbClient, limit = 20): Promise<{ id: string; ok: boolean; error?: string }[]> {
  const due = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(isNotNull(posts.scheduledAt), lte(posts.scheduledAt, new Date()), inArray(posts.status, ["pending", "approved"])))
    .limit(limit);
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const { id } of due) results.push({ id, ...(await dispatchScheduledPost(db, id)) });
  return results;
}
