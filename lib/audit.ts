import { DbClient } from "@/db";
import { auditLog } from "@/db/schema";

export interface AuditEntry {
  userId: string | null;
  /** Roblox username for a person, "<username>'s <AI>" for an AI acting for them. */
  actorLabel: string;
  via: "web" | "ai";
  action: string;
  summary?: string | null;
  status: "ok" | "error" | "pending" | "cancelled" | "sent";
  detail?: unknown;
}

const MAX_DETAIL = 4000;

/** Hides passwords, secrets, tokens and webhook URLs (anyone with one can post to that channel) before anything is stored or shown to an AI. */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return "…";
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = /password|secret|token|apikey|api_key|private|webhook/i.test(k) && v ? "[hidden]" : redactSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Writes one audit log row. Never throws: a failed log must not fail the action. */
export async function writeAudit(db: DbClient, e: AuditEntry): Promise<void> {
  try {
    let detail: string | null = null;
    if (e.detail !== undefined) {
      detail = JSON.stringify(redactSecrets(e.detail));
      if (detail.length > MAX_DETAIL) detail = detail.slice(0, MAX_DETAIL) + "…";
    }
    await db.insert(auditLog).values({
      at: new Date(),
      userId: e.userId,
      actorLabel: e.actorLabel.slice(0, 120),
      via: e.via,
      action: e.action.slice(0, 120),
      summary: e.summary ? e.summary.slice(0, 500) : null,
      status: e.status,
      detail,
    });
  } catch (err) {
    console.error("audit log write failed", err);
  }
}
