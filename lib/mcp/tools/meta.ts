import { and, desc, eq } from "drizzle-orm";
import { aiConfirmations, auditLog } from "@/db/schema";
import { S, ToolDef, ToolError } from "../types";
import { aiActorLabel } from "../oauth";

export const metaTools: ToolDef[] = [
  {
    name: "whoami",
    title: "Who am I acting as",
    description: "The FTN account this AI acts as, its roles, and how its actions are labelled in the audit log.",
    input: {},
    kind: "read",
    run: async (ctx) => ({
      user: { id: ctx.user.id, robloxUsername: ctx.user.robloxUsername, displayName: ctx.user.displayName, roles: ctx.user.roles },
      auditLabel: aiActorLabel(ctx.user, ctx.aiName),
      note: "Public content (articles, posts, Discord messages) shows this person. Risky actions return an approval link the person must open.",
    }),
  },
  {
    name: "get_approval",
    title: "Check an approval",
    description: "Whether the person approved a risky action (from its approvalId), and its result once it ran.",
    input: { approvalId: S.str("The approvalId a risky tool returned") },
    required: ["approvalId"],
    kind: "read",
    run: async (ctx, a) => {
      const rows = await ctx.db
        .select()
        .from(aiConfirmations)
        .where(and(eq(aiConfirmations.id, String(a.approvalId)), eq(aiConfirmations.userId, ctx.user.id)))
        .limit(1);
      const r = rows[0];
      if (!r) throw new ToolError("No such approval.");
      const expired = r.status === "pending" && r.expiresAt.getTime() < Date.now();
      return {
        status: expired ? "expired" : r.status,
        summary: r.summary,
        result: r.result ? JSON.parse(r.result) : null,
        approveUrl: r.status === "pending" && !expired ? `${ctx.origin}/admin/ai/confirm/${r.id}` : undefined,
      };
    },
  },
  {
    name: "get_audit_log",
    title: "Audit log",
    description: "Recent admin actions by people and AIs (who, what, when, result).",
    input: { limit: S.int("How many (default 50, at most 200)"), via: S.enum(["web", "ai"], "Only actions from the website or only from AIs") },
    kind: "read",
    run: async (ctx, a) => {
      const limit = Math.min(Math.max(Number(a.limit) || 50, 1), 200);
      const rows = await ctx.db
        .select()
        .from(auditLog)
        .where(a.via ? eq(auditLog.via, a.via) : undefined)
        .orderBy(desc(auditLog.at))
        .limit(limit);
      return rows.map((r) => ({ at: r.at, who: r.actorLabel, via: r.via, action: r.action, summary: r.summary, status: r.status }));
    },
  },
];
