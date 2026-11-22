"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { Body, Facts, Loading, PageBar, Pill, Screen, ago, formatWhen } from "@/components/admin/ui";

const canUseAi = (roles: string[] = []) => roles.includes("site_admin");

interface Confirmation {
  id: string;
  app: string;
  tool: string;
  title: string;
  summary: string;
  args: Record<string, unknown>;
  status: "pending" | "done" | "failed" | "cancelled" | "expired";
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  result: unknown;
}

const STATUS: Record<Confirmation["status"], { tone: "amber" | "green" | "red" | "grey"; label: string }> = {
  pending: { tone: "amber", label: "Waiting for you" },
  done: { tone: "green", label: "Done" },
  failed: { tone: "red", label: "Failed" },
  cancelled: { tone: "grey", label: "Cancelled" },
  expired: { tone: "grey", label: "Expired" },
};

// A risky action an AI asked for (delete, publish to Discord, roles, settings): the person approves it here.
export default function AiConfirmPage() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<Confirmation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/ai/confirmations/${id}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json.error || "Couldn't load");
        setC(json.confirmation);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function decide(decision: "approve" | "cancel") {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ai/confirmations/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json.error || "That didn't work");
      setC(json.confirmation);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const s = c ? STATUS[c.status] : null;
  return (
    <AdminAuthGuard requiredPermission={canUseAi} featureTitle="AI approvals">
      <Screen>
        <PageBar title="Approve an AI action" crumb={{ href: "/admin/settings/ai", label: "AI access" }} />
        <Body scroll>
          <div className="ai-confirm">
            {!c && !error && <Loading />}
            {error && <div className="card empty">{error}</div>}
            {c && s && (
              <>
                <div className="card" style={{ padding: 20, display: "grid", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
                    <div className="t12 muted">{c.app} asks to</div>
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </div>
                  <div className="t20" style={{ fontWeight: 600 }}>{c.summary}</div>
                  <Facts
                    rows={[
                      ["Action", c.title],
                      ["Asked", `${formatWhen(c.createdAt)} (${ago(c.createdAt)})`],
                      [c.status === "pending" ? "Link works until" : "Decided", formatWhen(c.status === "pending" ? c.expiresAt : c.decidedAt)],
                    ]}
                  />
                  <details>
                    <summary className="t12 muted" style={{ cursor: "pointer" }}>
                      Exactly what it will send
                    </summary>
                    <pre>{JSON.stringify(c.args, null, 2)}</pre>
                  </details>
                  {c.status === "pending" && (
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button type="button" className="btn" disabled={busy} onClick={() => decide("cancel")}>
                        Cancel
                      </button>
                      <button type="button" className="btn primary" disabled={busy} onClick={() => decide("approve")}>
                        {busy ? "Working…" : "Approve"}
                      </button>
                    </div>
                  )}
                </div>
                {(c.status === "done" || c.status === "failed") && c.result !== null && (
                  <div className="card" style={{ padding: 20, display: "grid", gap: 10 }}>
                    <div style={{ fontWeight: 600 }}>{c.status === "done" ? "Result" : "What went wrong"}</div>
                    <pre>{JSON.stringify(c.result, null, 2)}</pre>
                    <div className="t12 muted">Passwords and keys show only here. The AI gets a copy without them.</div>
                  </div>
                )}
                <div className="t12 muted">
                  You can go back to {c.app} now. <Link className="link" href="/admin/settings/ai">All AI activity</Link>
                </div>
              </>
            )}
          </div>
        </Body>
      </Screen>
    </AdminAuthGuard>
  );
}
