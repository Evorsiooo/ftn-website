import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, users } from "@/db/schema";
import { LEADERSHIP_CHANNEL_ID, verifyDiscordSignature } from "@/lib/discord";
import { buildLeadershipMessage } from "@/lib/discord-posts";
import { decidePost } from "@/lib/post-decision";

export const runtime = "edge";

const PING = 1;
const MESSAGE_COMPONENT = 3;
const MODAL_SUBMIT = 5;

const RESPONSE_PONG = 1;
const RESPONSE_MESSAGE = 4;
const RESPONSE_UPDATE_MESSAGE = 7;
const RESPONSE_MODAL = 9;

const EPHEMERAL = 64;

function ephemeral(content: string) {
  return NextResponse.json({ type: RESPONSE_MESSAGE, data: { content, flags: EPHEMERAL } });
}

function actorLabel(interaction: any): string {
  const user = interaction.member?.user || interaction.user || {};
  const name = interaction.member?.nick || user.global_name || user.username || "someone";
  return `${name} (Discord)`;
}

// Receives every Discord interaction for the bot: the Approve/Deny buttons in #leadership
// and the deny-reason modal.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const valid = await verifyDiscordSignature(
    request.headers.get("x-signature-ed25519"),
    request.headers.get("x-signature-timestamp"),
    rawBody,
    ((process.env as any).DISCORD_PUBLIC_KEY as string | undefined) || undefined
  );
  if (!valid) return new NextResponse("Invalid request signature", { status: 401 });

  const interaction = JSON.parse(rawBody);
  if (interaction.type === PING) return NextResponse.json({ type: RESPONSE_PONG });

  // Only buttons and modals from the #leadership channel are handled.
  if (interaction.channel_id !== LEADERSHIP_CHANNEL_ID) {
    return ephemeral("These buttons only work in the leadership channel.");
  }

  const d1 = (process.env as any).DB as D1Database;
  if (!d1) return ephemeral("The database is unavailable. Try again in a moment.");
  const db = getDb(d1);

  try {
    if (interaction.type === MESSAGE_COMPONENT) {
      const [, action, postId] = String(interaction.data?.custom_id || "").split(":");
      if (!postId) return ephemeral("Unknown button.");

      if (action === "deny") {
        // Ask for the reason before denying.
        return NextResponse.json({
          type: RESPONSE_MODAL,
          data: {
            custom_id: `post:denymodal:${postId}`,
            title: "Deny post",
            components: [
              {
                type: 1,
                components: [
                  { type: 4, custom_id: "reason", label: "Reason", style: 2, min_length: 1, max_length: 500, required: true },
                ],
              },
            ],
          },
        });
      }

      if (action === "approve") {
        const result = await decidePost(db, postId, "approve", "", { label: actorLabel(interaction) });
        if (!result.ok) return ephemeral(result.error);
        return await updatedLeadershipMessage(db, postId);
      }
      return ephemeral("Unknown button.");
    }

    if (interaction.type === MODAL_SUBMIT) {
      const [, action, postId] = String(interaction.data?.custom_id || "").split(":");
      if (action !== "denymodal" || !postId) return ephemeral("Unknown form.");
      const reason = String(interaction.data?.components?.[0]?.components?.[0]?.value || "").trim().slice(0, 500);
      if (!reason) return ephemeral("A reason is required to deny a post.");

      const result = await decidePost(db, postId, "deny", reason, { label: actorLabel(interaction) });
      if (!result.ok) return ephemeral(result.error);
      return await updatedLeadershipMessage(db, postId);
    }
  } catch (err) {
    console.error("Discord interaction error:", err);
    return ephemeral("Something went wrong. Please try again.");
  }

  return ephemeral("Unsupported interaction.");
}

// Replaces the review message with its decided version (no more buttons).
async function updatedLeadershipMessage(db: ReturnType<typeof getDb>, postId: string) {
  const rows = await db
    .select({ post: posts, creatorName: users.displayName })
    .from(posts)
    .leftJoin(users, eq(users.id, posts.createdBy))
    .where(eq(posts.id, postId))
    .limit(1);
  if (rows.length === 0) return ephemeral("Post not found.");
  const message = buildLeadershipMessage(rows[0].post, rows[0].creatorName);
  return NextResponse.json({
    type: RESPONSE_UPDATE_MESSAGE,
    data: { content: message.content, components: message.components, allowed_mentions: message.allowed_mentions },
  });
}
