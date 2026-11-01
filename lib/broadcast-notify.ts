import { and, eq, isNull, lt, or } from "drizzle-orm";
import { DbClient } from "@/db";
import { broadcasts } from "@/db/schema";
import { FEED_CHANNELS, FTN_PLUS_EMOJI, discordApi, siteUrl } from "@/lib/discord";
import { expandOccurrences } from "@/lib/schedule-core";
import { loadShowsAndBroadcasts } from "@/lib/schedule";

// An airing is announced if it started within this window; older ones (e.g. after an outage) are skipped.
const WINDOW_MS = 10 * 60 * 1000;

export function buildGoLiveMessage(custom: string | null): string {
  const lines = [`${FTN_PLUS_EMOJI} We're live on FTN+!`];
  if (custom && custom.trim()) lines.push(custom.trim());
  lines.push("", "🔗  Tune in here", `${siteUrl()}/plus/radio`);
  return lines.join("\n");
}

// Posts the go-live message in each ticked Ro-State feed and publishes (crossposts) it,
// the same way approved posts are published. Returns how many feeds got the message.
async function sendGoLive(roStates: string[], custom: string | null): Promise<number> {
  let sent = 0;
  for (const key of roStates) {
    const channelId = FEED_CHANNELS[key];
    if (!channelId) continue;
    try {
      const msg = await discordApi("POST", `/channels/${channelId}/messages`, {
        content: buildGoLiveMessage(custom),
        allowed_mentions: { parse: [] },
      });
      sent++;
      try {
        await discordApi("POST", `/channels/${channelId}/messages/${msg.id}/crosspost`);
      } catch (err) {
        console.error("Go-live crosspost failed:", err); // not an announcement channel, or already published
      }
    } catch (err) {
      console.error(`Go-live message to ${key} failed:`, err);
    }
  }
  return sent;
}

// Called every minute by the cron. Each airing is claimed in the database before anything is sent
// (last_notified_at = its start), so overlapping runs cannot announce it twice.
export async function dispatchGoLiveNotifications(db: DbClient, now = new Date()) {
  const { shows, broadcasts: list } = await loadShowsAndBroadcasts(db);
  const candidates = list.filter((b) => b.notify && b.notifyRoStates.length > 0 && b.status === "scheduled");
  const results: { id: string; sent: number }[] = [];
  if (candidates.length === 0) return results;

  const rows = await db.select({ id: broadcasts.id, last: broadcasts.lastNotifiedAt }).from(broadcasts);
  const lastById = new Map(rows.map((r) => [r.id, r.last]));

  const occurrences = expandOccurrences(shows, candidates, new Date(now.getTime() - WINDOW_MS), now, false).filter(
    (o) => o.start <= now && o.start.getTime() >= now.getTime() - WINDOW_MS
  );
  for (const o of occurrences) {
    const b = candidates.find((c) => c.id === o.broadcastId)!;
    const prev = lastById.get(b.id) ?? null;
    const startSec = Math.floor(o.start.getTime() / 1000) * 1000;
    const claimed = await db
      .update(broadcasts)
      .set({ lastNotifiedAt: new Date(startSec) })
      .where(
        and(
          eq(broadcasts.id, b.id),
          or(isNull(broadcasts.lastNotifiedAt), lt(broadcasts.lastNotifiedAt, new Date(startSec)))
        )
      )
      .returning({ id: broadcasts.id });
    if (claimed.length === 0) continue; // already announced
    const sent = await sendGoLive(b.notifyRoStates, b.notifyMessage);
    if (sent === 0) {
      // Nothing went out: release the claim so the next minute retries (within the window).
      await db.update(broadcasts).set({ lastNotifiedAt: prev }).where(eq(broadcasts.id, b.id));
    }
    results.push({ id: b.id, sent });
  }
  return results;
}
