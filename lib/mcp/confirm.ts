import { eq } from "drizzle-orm";
import { aiConfirmations } from "@/db/schema";
import { redactSecrets, writeAudit } from "@/lib/audit";
import { readableSummary } from "./names";
import { aiActorLabel } from "./oauth";
import { ToolCtx, ToolDef } from "./types";

export const CONFIRM_MINUTES = 60;

/** A risky AI action: saved, and the person approves it on the site. The AI gets the link. */
export async function requestConfirmation(ctx: ToolCtx, tool: ToolDef, args: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const summary = await readableSummary(ctx.db, tool.summary ? tool.summary(args) : tool.title, tool.refs, args);
  const now = Date.now();
  await ctx.db.insert(aiConfirmations).values({
    id,
    userId: ctx.user.id,
    grantId: ctx.grantId,
    clientName: ctx.aiName,
    tool: tool.name,
    args: JSON.stringify(args),
    summary,
    status: "pending",
    createdAt: new Date(now),
    expiresAt: new Date(now + CONFIRM_MINUTES * 60_000),
  });
  await writeAudit(ctx.db, {
    userId: ctx.user.id,
    actorLabel: aiActorLabel(ctx.user, ctx.aiName),
    via: "ai",
    action: tool.name,
    summary: `${summary} (waiting for approval)`,
    status: "pending",
    detail: { confirmationId: id, args },
  });
  const url = `${ctx.origin}/admin/ai/confirm/${id}`;
  return {
    status: "waiting_for_approval",
    approvalId: id,
    approveUrl: url,
    message: `This needs ${ctx.user.displayName}'s OK. Ask them to open ${url} and click Approve (the link works for ${CONFIRM_MINUTES} minutes). Then check the result with get_approval.`,
  };
}

/** Runs an approved action as the approving person, labelled as their AI. Returns the full result
 * for the approval page; only a redacted copy is stored for the AI. */
export async function runConfirmation(
  ctx: ToolCtx,
  tool: ToolDef,
  row: typeof aiConfirmations.$inferSelect
): Promise<{ ok: boolean; result: unknown }> {
  const args = JSON.parse(row.args) as Record<string, unknown>;
  let ok = true;
  let result: unknown;
  try {
    result = await tool.run(ctx, args);
  } catch (err) {
    ok = false;
    result = { error: err instanceof Error ? err.message : String(err) };
  }
  await ctx.db
    .update(aiConfirmations)
    .set({ status: ok ? "done" : "failed", result: JSON.stringify(redactSecrets(result)).slice(0, 20000), decidedAt: new Date() })
    .where(eq(aiConfirmations.id, row.id));
  await writeAudit(ctx.db, {
    userId: ctx.user.id,
    actorLabel: aiActorLabel(ctx.user, row.clientName),
    via: "ai",
    action: tool.name,
    summary: `${row.summary} (approved by ${ctx.user.robloxUsername})`,
    status: ok ? "ok" : "error",
    detail: { confirmationId: row.id, args, result },
  });
  return { ok, result };
}
