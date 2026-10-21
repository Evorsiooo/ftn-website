import { eq } from "drizzle-orm";
import { DbClient } from "@/db";
import { posts, users } from "@/db/schema";
import {
  DiscordError,
  FEED_CHANNELS,
  FTN_PLUS_CHANNEL_ID,
  FTN_PLUS_EMOJI,
  IS_COMPONENTS_V2,
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

function imageUrl(post: Post): string {
  return `${siteUrl()}${post.imageUrl}`;
}

function learnMoreLine(post: Post): string | null {
  if (!post.organizationName || !post.messageLink) return null;
  return `🔗  Learn more about ${post.organizationName}\n${post.messageLink}`;
}

// The message people see (FTN+ channel and feeds): the image in a box of its own, then the optional text box (timed line, Learn more) beneath it.
export function buildPostMessage(post: Post, timedLine: string | null = null, amendments: string[] = []) {
  const lines: string[] = [];
  if (timedLine) lines.push(timedLine, "");
  const learnMore = learnMoreLine(post);
  if (learnMore) lines.push(learnMore);
  for (const note of amendments) lines.push("", `*edit: ${note}*`);

  const components: any[] = [{ type: 17, components: [{ type: 12, items: [{ media: { url: imageUrl(post) } }] }] }];
  const text = lines.join("\n").trim();
  if (text) components.push({ type: 17, components: [{ type: 10, content: text }] });
  return { flags: IS_COMPONENTS_V2, components, allowed_mentions: { parse: [] } };
}

function stateLabel(post: Post): string {
  return RO_STATES.find((s) => s.key === post.roState)?.label ?? post.roState;
}

// The review message in #leadership. While pending it carries the Approve and Deny buttons.
export function buildLeadershipMessage(post: Post, creatorName: string | null) {
  const header = [
    `**New post for review** · ${stateLabel(post)} · by ${creatorName || "unknown"}`,
    `**${post.headline}**`,
    post.organizationName ? `Ad: ${post.organizationName}` : "No ad (boilerplate)",
  ].join("\n");

  let status: string | null = null;
  if (post.status === "approved") status = `✅ Approved by ${post.decidedByLabel || "leadership"}`;
  if (post.status === "denied") status = `❌ Denied by ${post.decidedByLabel || "leadership"}: ${post.denyReason || "no reason given"}`;

  const image: any[] = [{ type: 12, items: [{ media: { url: imageUrl(post) } }] }];
  if (post.status === "pending") {
    image.push({
      type: 1,
      components: [
        { type: 2, style: 3, label: "Approve", custom_id: `post:approve:${post.id}` },
        { type: 2, style: 4, label: "Deny", custom_id: `post:deny:${post.id}` },
      ],
    });
  }
  const accent = post.status === "approved" ? 0x2ecc71 : post.status === "denied" ? 0xe74c3c : 0xf1c40f;
  return {
    flags: IS_COMPONENTS_V2,
    components: [
      { type: 10, content: `<@&${LEADERSHIP_ROLE_ID}>` },
      { type: 17, accent_color: accent, components: [{ type: 10, content: status ? `${header}\n\n${status}` : header }] },
      { type: 17, accent_color: accent, components: image },
    ],
    allowed_mentions: { parse: [], roles: [LEADERSHIP_ROLE_ID] },
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
      const msg = await discordApi("POST", `/channels/${FTN_PLUS_CHANNEL_ID}/messages`, buildPostMessage(post));
      await db.update(posts).set({ ftnPlusMessageId: msg.id }).where(eq(posts.id, postId));
    }
    post = await reload(db, postId);
    if (!post.leadershipMessageId) {
      const msg = await discordApi(
        "POST",
        `/channels/${LEADERSHIP_CHANNEL_ID}/messages`,
        buildLeadershipMessage(post, await creatorName(db, post.createdBy))
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
  const msg = await discordApi("POST", `/channels/${channelId}/messages`, buildPostMessage(post, timedLine));
  await db.update(posts).set({ feedChannelId: channelId, feedMessageId: msg.id }).where(eq(posts.id, post.id));

  try {
    await discordApi("POST", `/channels/${channelId}/messages/${msg.id}/crosspost`);
  } catch (err) {
    // Not an announcement channel, or already published: the post is out either way.
    console.error("Crosspost failed:", err);
  }
}

// Brings the existing Discord messages in line with the post (after an edit or a decision).
export async function refreshPostMessages(db: DbClient, postId: string): Promise<{ ok: boolean; error?: string }> {
  const post = await reload(db, postId);
  try {
    if (post.ftnPlusMessageId) {
      await discordApi("PATCH", `/channels/${FTN_PLUS_CHANNEL_ID}/messages/${post.ftnPlusMessageId}`, buildPostMessage(post));
    }
    if (post.leadershipMessageId) {
      await discordApi(
        "PATCH",
        `/channels/${LEADERSHIP_CHANNEL_ID}/messages/${post.leadershipMessageId}`,
        buildLeadershipMessage(post, await creatorName(db, post.createdBy))
      );
    }
    if (post.feedMessageId && post.feedChannelId) {
      await discordApi(
        "PATCH",
        `/channels/${post.feedChannelId}/messages/${post.feedMessageId}`,
        buildPostMessage(post, timedExclusiveLine(post.createdAt, post.decidedAt ?? new Date()))
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
