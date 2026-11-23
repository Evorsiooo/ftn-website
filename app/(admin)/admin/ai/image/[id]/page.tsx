"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { Body, Facts, Loading, PageBar, Pill, Screen, ago, formatWhen } from "@/components/admin/ui";

const canUseAi = (roles: string[] = []) => roles.includes("site_admin");

interface ImageRequest {
  id: string;
  app: string;
  folder: string;
  note: string;
  status: "pending" | "done" | "cancelled" | "expired";
  url: string | null;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
}

const STATUS: Record<ImageRequest["status"], { tone: "amber" | "green" | "grey"; label: string }> = {
  pending: { tone: "amber", label: "Waiting for you" },
  done: { tone: "green", label: "Sent" },
  cancelled: { tone: "grey", label: "Cancelled" },
  expired: { tone: "grey", label: "Expired" },
};

// An AI asked for an image it can't get itself (e.g. one on this computer): the person picks it here.
export default function AiImagePage() {
  const { id } = useParams<{ id: string }>();
  const [req, setReq] = useState<ImageRequest | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/ai/images/${id}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json.error || "Couldn't load");
        setReq(json.request);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function send(body: { url?: string; cancel?: boolean }) {
    const res = await fetch(`/api/admin/ai/images/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as any;
    if (!res.ok) throw new Error(json.error || "That didn't work");
    setReq(json.request);
    setError("");
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  // Uploaded like any admin upload, then its URL goes to the AI.
  const upload = (file: File) =>
    run(async () => {
      if (!req) return;
      const form = new FormData();
      form.set("file", file);
      form.set("folder", req.folder);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json.error || "Upload failed");
      await send({ url: json.url });
    });

  const s = req ? STATUS[req.status] : null;
  return (
    <AdminAuthGuard requiredPermission={canUseAi} featureTitle="AI images">
      <Screen>
        <PageBar title="Send an image to the AI" crumb={{ href: "/admin/settings/ai", label: "AI access" }} />
        <Body scroll>
          <div className="ai-confirm">
            {!req && !error && <Loading />}
            {error && !req && <div className="card empty">{error}</div>}
            {req && s && (
              <>
                <div className="card" style={{ padding: 20, display: "grid", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
                    <div className="t12 muted">{req.app} asks for an image</div>
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </div>
                  <div className="t20" style={{ fontWeight: 600 }}>{req.note || "An image"}</div>
                  <Facts
                    rows={[
                      ["Asked", `${formatWhen(req.createdAt)} (${ago(req.createdAt)})`],
                      [req.status === "pending" ? "Link works until" : "Done", formatWhen(req.status === "pending" ? req.expiresAt : req.decidedAt)],
                    ]}
                  />
                  {error && <div className="t12" style={{ color: "var(--a-red)" }}>{error}</div>}
                  {req.status === "pending" && (
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button type="button" className="btn" disabled={busy} onClick={() => run(() => send({ cancel: true }))}>
                        Cancel
                      </button>
                      <label className="btn primary" aria-disabled={busy} style={{ cursor: busy ? "default" : "pointer" }}>
                        {busy ? "Uploading…" : "Choose image"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          disabled={busy}
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) upload(f);
                          }}
                        />
                      </label>
                    </div>
                  )}
                  {req.status === "done" && req.url && (
                     
                    <img src={req.url} alt="" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8, justifySelf: "start" }} />
                  )}
                </div>
                <div className="t12 muted">
                  You can go back to {req.app} now. <Link className="link" href="/admin/settings/ai">All AI activity</Link>
                </div>
              </>
            )}
          </div>
        </Body>
      </Screen>
    </AdminAuthGuard>
  );
}
