"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { confirmDialog } from "@/components/gs/dialogs";
import { SETTINGS_PAGES } from "@/components/gs/admin-nav";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { Body, Loading, PageBar, Pill, Screen, Section, Seg, ago, formatWhen } from "@/components/admin/ui";
import { cn } from "@/lib/utils";

const canUseAi = (roles: string[] = []) => roles.includes("site_admin");

interface Overview {
  mcpUrl: string;
  connections: { id: string; app: string; username: string; displayName: string; mine: boolean; createdAt: string; lastUsedAt: string | null }[];
  pending: { id: string; app: string; summary: string; createdAt: string; expiresAt: string }[];
  audit: { id: number; at: string; who: string; via: "web" | "ai"; action: string; summary: string | null; status: string }[];
}

const STATUS: Record<string, { tone: "green" | "red" | "amber" | "grey"; label: string }> = {
  ok: { tone: "green", label: "Done" },
  error: { tone: "red", label: "Failed" },
  pending: { tone: "amber", label: "Waiting" },
  cancelled: { tone: "grey", label: "Cancelled" },
  sent: { tone: "grey", label: "Sent" },
};

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8, minWidth: 0 }}>
      <input className="input" readOnly value={value} onFocus={(e) => e.target.select()} aria-label="MCP server address" style={{ minWidth: 0, flex: 1 }} />
      <button
        type="button"
        className="btn"
        onClick={() => {
          navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="ic" /> : <Copy className="ic" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function AiAccessPage() {
  const router = useRouter();
  const meta = SETTINGS_PAGES.find((p) => p.key === "ai")!;
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "ai" | "web">("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/ai${filter === "all" ? "" : `?via=${filter}`}`, { cache: "no-store" });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json.error || "Couldn't load");
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    }
  }, [filter]);
  useEffect(() => {
    load();
  }, [load]);

  async function disconnect(c: Overview["connections"][number]) {
    const ok = await confirmDialog(`Disconnect ${c.app}${c.mine ? "" : ` (${c.displayName}'s)`}? It stops working at once; connecting again needs a new sign-in.`, {
      ok: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    await fetch("/api/admin/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "disconnect", id: c.id }) });
    load();
  }

  return (
    <AdminAuthGuard requiredPermission={canUseAi} featureTitle="AI access">
      <Screen>
        <PageBar
          title={meta.title}
          crumb={{ href: "/admin/settings", label: "Settings" }}
          end={
            <select className="select sm show-m" value={meta.href} onChange={(e) => router.push(e.target.value)} aria-label="Settings page">
              {SETTINGS_PAGES.map((p) => (
                <option key={p.key} value={p.href}>
                  {p.title}
                </option>
              ))}
            </select>
          }
        />
        <Body>
          <div className="settings">
            <nav className="subnav hide-m" aria-label="Settings pages">
              {SETTINGS_PAGES.map((p) => (
                <Link key={p.key} href={p.href} className={cn(p.key === "ai" && "on")} aria-current={p.key === "ai" ? "page" : undefined}>
                  {p.title}
                </Link>
              ))}
            </nav>
            <div className="adm-scroll" style={{ height: "100%", minHeight: 0 }}>
              <div className="formcol">
                {error && <div className="empty">{error}</div>}
                {!data && !error ? (
                  <Loading />
                ) : data ? (
                  <>
                    <Section
                      title="Connect an AI"
                      desc="Claude, ChatGPT or Gemini can run the admin panel for you: articles, the schedule, songs, ads, sports and more. For now, only Site Administrators can connect one."
                    >
                      <CopyField value={data.mcpUrl} />
                      <ul className="help ai-steps">
                        <li>
                          <b>Claude</b>: Customize, Connectors, Add custom connector, then paste the address.
                        </li>
                        <li>
                          <b>ChatGPT</b>: chatgpt.com/plugins, the + button, add a custom MCP server with the address and OAuth sign-in.
                        </li>
                        <li>
                          <b>Gemini</b>: Settings, Connected Apps, Custom apps, Add a custom app (for now Google allows this only for personal accounts in the US).
                        </li>
                      </ul>
                      <p className="help">
                        The app sends you to an FTN page to sign in and click Allow. What it publishes shows your name; this log shows it as
                        &ldquo;your username&rsquo;s Claude&rdquo;. Deleting, publishing to Discord, roles and settings are marked as risky, so the app
                        asks you before running them (you can change that per tool in the app&rsquo;s connector settings).
                      </p>
                    </Section>

                    {data.pending.length > 0 && (
                      <Section title="Images an AI is waiting for" aside={<Pill tone="amber">{data.pending.length}</Pill>}>
                        <div className="rows">
                          {data.pending.map((p) => (
                            <Link key={p.id} href={`/admin/ai/image/${p.id}`} className="r">
                              <div className="grow">
                                <div className="trunc" style={{ fontWeight: 600 }}>{p.summary}</div>
                                <div className="t12 muted">
                                  Asked by {p.app} {ago(p.createdAt)}
                                </div>
                              </div>
                              <span className="btn sm">Choose image</span>
                            </Link>
                          ))}
                        </div>
                      </Section>
                    )}

                    <Section title="Connected AI apps">
                      {data.connections.length === 0 ? (
                        <div className="rows">
                          <div className="r muted">No AI is connected.</div>
                        </div>
                      ) : (
                        <div className="rows">
                          {data.connections.map((c) => (
                            <div key={c.id} className="r">
                              <div className="grow">
                                <div className="trunc" style={{ fontWeight: 600 }}>
                                  {c.username}&rsquo;s {c.app}
                                </div>
                                <div className="t12 muted trunc">
                                  Connected {formatWhen(c.createdAt)} · {c.lastUsedAt ? `last used ${ago(c.lastUsedAt)}` : "not used yet"}
                                </div>
                              </div>
                              <button type="button" className="btn sm danger" onClick={() => disconnect(c)}>
                                Disconnect
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>

                    <Section
                      title="Audit log"
                      desc="Admin actions by people and AIs, newest first. Website actions show what was sent, not whether it worked."
                      aside={
                        <Seg
                          value={filter}
                          onChange={setFilter}
                          options={[
                            { value: "all", label: "All" },
                            { value: "ai", label: "AI" },
                            { value: "web", label: "People" },
                          ]}
                        />
                      }
                    >
                      {data.audit.length === 0 ? (
                        <div className="rows">
                          <div className="r muted">Nothing yet.</div>
                        </div>
                      ) : (
                        <div className="rows">
                          {data.audit.map((a) => {
                            const s = STATUS[a.status] || STATUS.sent;
                            return (
                              <div key={a.id} className="r">
                                <div className="grow">
                                  <div className="trunc">{a.summary || a.action}</div>
                                  <div className="t12 muted trunc">
                                    {a.who} · {formatWhen(a.at)}
                                  </div>
                                </div>
                                <Pill tone={s.tone}>{s.label}</Pill>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Section>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </Body>
      </Screen>
    </AdminAuthGuard>
  );
}
