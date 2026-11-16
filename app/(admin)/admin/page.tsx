"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { fetchSession } from "@/lib/session-client";
import { fetchAdminSummary, refreshAdminSummary, type AdminSummary } from "@/lib/admin-summary";
import { canConfigureSite, canManagePosts, canManageSports, canPublishArticles, isPostsLeadership } from "@/lib/rbac";
import { RO_STATES } from "@/lib/ro-states";
import { toast, promptDialog } from "@/components/gs/dialogs";
import { Body, PageBar, Pill, Screen, ago, hm } from "@/components/admin/ui";
import { studioHref, hostedOnRadio } from "@/components/admin/schedule/on-air-strip";

type Me = { id: string; displayName?: string; robloxUsername?: string; roles: string[] };

const dayTime = (d: Date) => (d.toDateString() === new Date().toDateString() ? `Today ${hm(d)}` : `${d.toLocaleDateString(undefined, { weekday: "short" })} ${hm(d)}`);
const stateLabel = (key: string) => RO_STATES.find((s) => s.key === key)?.label ?? key;

/**
 * Today: what needs this person now, as short lists they can act on in place.
 * Each group only shows for roles that can act on it, and only when it has something in it.
 */
export default function AdminToday() {
  const [me, setMe] = useState<Me | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [pending, setPending] = useState<any[] | null>(null);
  const [tips, setTips] = useState<any[] | null>(null);
  const [results, setResults] = useState<{ id: string; name: string; league: string; startsAt: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchSession()
      .then((data: any) => setMe(data?.user ? { ...data.user, roles: data.user.roles || [] } : { id: "", roles: [] }))
      .catch(() => setMe({ id: "", roles: [] }));
  }, []);

  const roles = me?.roles ?? [];
  const load = useCallback(async () => {
    if (!me || roles.length === 0) return;
    refreshAdminSummary();
    const [s, p, t, sp] = await Promise.all([
      fetchAdminSummary(roles),
      canManagePosts(roles)
        ? fetch("/api/admin/posts")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : null,
      canPublishArticles(roles) || canConfigureSite(roles)
        ? fetch("/api/admin/tips")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : null,
      canManageSports(roles)
        ? fetch("/api/sports/data")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : null,
    ]);
    setSummary(s);
    setPending(p ? (p as any).posts.filter((x: any) => x.status === "pending" && !x.scheduledAt) : null);
    if (sp) {
      const d = sp as any;
      const teams = new Map<string, string>((d.teams ?? []).map((x: any) => [x.id, x.name]));
      const leagues = new Map<string, string>((d.leagues ?? []).map((x: any) => [x.id, x.name]));
      const now = Date.now();
      setResults(
        (d.events ?? [])
          .filter((e: any) => e.status === "scheduled" && +new Date(e.startsAt) < now)
          .map((e: any) => ({
            id: e.id,
            name: e.name || (e.homeTeamId && e.awayTeamId ? `${teams.get(e.homeTeamId) ?? "?"} vs ${teams.get(e.awayTeamId) ?? "?"}` : "Event"),
            league: leagues.get(e.leagueId) ?? "",
            startsAt: e.startsAt,
          })),
      );
    } else setResults(null);
    setTips(t ? (t as any).tips.filter((x: any) => x.status === "unread").sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt)) : null);
  }, [me]);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async (post: any, decision: "approve" | "deny") => {
    let reason = "";
    if (decision === "deny") {
      reason = ((await promptDialog("Why is this post denied? The author sees this.", "", { ok: "Deny", danger: true })) || "").trim();
      if (!reason) return;
    }
    setBusy(post.id);
    try {
      const res = await fetch(`/api/admin/posts/${post.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason }) });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) toast(data.error || "Failed to save decision");
      else toast(decision === "approve" ? `Approved: ${post.headline}` : `Denied: ${post.headline}`);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const leadership = isPostsLeadership(roles);
  const loading = !me || (roles.length > 0 && !summary);
  const onAir = summary?.onAir;
  const nextHosted = onAir?.upcoming.find((o) => hostedOnRadio(o)) ?? null;
  const imports = summary?.imports;
  const adsLow = summary?.adsLow ?? [];
  const drafts = summary?.drafts;

  const needs = (pending?.length ?? 0) + (tips?.length ?? 0) + (imports?.review ? 1 : 0) + adsLow.length + (results?.length ?? 0);
  const firstName = (me?.displayName || me?.robloxUsername || "").split(" ")[0];

  return (
    <Screen>
      <PageBar title="Today" />
      <Body scroll>
        {loading ? (
          <div className="pane-empty">Loading…</div>
        ) : (
          <div className="today">
            <p className="greet">
              {firstName ? `Hi ${firstName}. ` : ""}
              {needs === 0 ? "Nothing needs you right now." : `${needs} ${needs === 1 ? "thing needs" : "things need"} you.`}
            </p>

            {pending && pending.length > 0 && (
              <section className="todo">
                <h2>
                  Posts waiting for approval <span className="c">{pending.length}</span>
                  <Link href="/admin/posts">All posts</Link>
                </h2>
                <div className="rows">
                  {pending.slice(0, 5).map((p) => (
                    <div key={p.id} className="r">
                      <Link href={`/admin/posts?id=${encodeURIComponent(p.id)}`} style={{ display: "contents", color: "inherit" }}>
                        <img src={p.imageUrl} alt="" className="thumb" style={{ width: 40, height: 40 }} />
                        <span className="grow">
                          <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                            {p.headline}
                          </span>
                          <span className="t12 muted">
                            {stateLabel(p.roState)} · {p.creatorName || "unknown"} · {ago(p.createdAt)}
                          </span>
                        </span>
                      </Link>
                      {leadership && (
                        <span style={{ display: "flex", gap: 6, flex: "none" }}>
                          <button type="button" className="btn sm" disabled={busy === p.id} onClick={() => decide(p, "deny")} aria-label={`Deny ${p.headline}`}>
                            <X className="ic-sm" />
                            <span className="hide-m">Deny</span>
                          </button>
                          <button type="button" className="btn sm strong" disabled={busy === p.id} onClick={() => decide(p, "approve")} aria-label={`Approve ${p.headline}`}>
                            <Check className="ic-sm" />
                            <span className="hide-m">Approve</span>
                          </button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {tips && tips.length > 0 && (
              <section className="todo">
                <h2>
                  Unread tips <span className="c">{tips.length}</span>
                  <Link href="/admin/tips">Tipline</Link>
                </h2>
                <div className="rows">
                  {tips.slice(0, 3).map((t) => (
                    <Link key={t.id} href={`/admin/tips?id=${encodeURIComponent(t.id)}`} className="r">
                      <span className="dot amber" />
                      <span className="grow">
                        <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                          {t.subject}
                        </span>
                        <span className="t12 muted trunc" style={{ display: "block" }}>
                          {t.details}
                        </span>
                      </span>
                      <span className="t12 muted" style={{ flex: "none" }}>
                        {ago(t.createdAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {results && results.length > 0 && (
              <section className="todo">
                <h2>
                  Needs a result <span className="c">{results.length}</span>
                  <Link href="/admin/sports">Sports</Link>
                </h2>
                <div className="rows">
                  {results.slice(0, 3).map((e) => (
                    <Link key={e.id} href={`/admin/sports?result=${encodeURIComponent(e.id)}`} className="r">
                      <span className="dot amber" />
                      <span className="grow">
                        <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                          {e.name}
                        </span>
                        <span className="t12 muted trunc" style={{ display: "block" }}>
                          {e.league} · {dayTime(new Date(e.startsAt))}
                        </span>
                      </span>
                      <span className="btn sm" style={{ flex: "none" }}>
                        Enter result
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {onAir && (
              <section className="todo">
                <h2>
                  Radio
                  <Link href="/admin/schedule">Schedule</Link>
                </h2>
                <div className="rows">
                  {onAir.current ? (
                    <div className="r">
                      <span className="dot red" />
                      <span className="grow">
                        <span className="trunc" style={{ display: "block", fontWeight: 600 }}>
                          On air: {onAir.current.title}
                        </span>
                        <span className="t12 muted">
                          Until {hm(onAir.current.end)}
                          {onAir.current.presenter ? ` · ${onAir.current.presenter}` : ""}
                        </span>
                      </span>
                      {hostedOnRadio(onAir.current) && (
                        <Link href={studioHref(onAir.current)} className="btn sm strong">
                          Open Studio
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="r">
                      <span className="dot grey" />
                      <span className="grow muted">Nothing on air. The AutoDJ is playing.</span>
                      {nextHosted && (
                        <Link href={studioHref(nextHosted)} className="btn sm">
                          Studio: {nextHosted.title}
                        </Link>
                      )}
                    </div>
                  )}
                  {imports && imports.review > 0 && (
                    <Link href="/admin/radio/library" className="r">
                      <span className="dot amber" />
                      <span className="grow">
                        {imports.review} imported {imports.review === 1 ? "song needs" : "songs need"} you to pick the right version
                      </span>
                      <span className="btn sm">Review</span>
                    </Link>
                  )}
                  {imports && imports.running > 0 && (
                    <Link href="/admin/radio/library" className="r">
                      <span className="dot blue" />
                      <span className="grow muted">
                        {imports.running} {imports.running === 1 ? "import" : "imports"} downloading
                      </span>
                    </Link>
                  )}
                </div>
              </section>
            )}

            {onAir && onAir.upcoming.length > 0 && (
              <section className="todo">
                <h2>Coming up</h2>
                <div className="rows">
                  {onAir.upcoming.map((o) => (
                    <Link key={o.broadcastId + o.start.getTime()} href="/admin/schedule" className="r">
                      <span className="t12 num muted" style={{ width: 96, flex: "none" }}>
                        {dayTime(o.start)}
                      </span>
                      <span className="grow trunc" style={{ fontWeight: 600 }}>
                        {o.title}
                      </span>
                      {o.presenter && <span className="t12 muted trunc hide-m">{o.presenter}</span>}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {summary?.adsLow && adsLow.length > 0 && (
              <section className="todo">
                <h2>
                  Ads running low <span className="c">{adsLow.length}</span>
                  <Link href="/admin/ads">Ads</Link>
                </h2>
                <div className="rows">
                  {adsLow.map((a) => (
                    <Link key={a.id} href={`/admin/ads?id=${encodeURIComponent(a.id)}`} className="r">
                      <span className="grow trunc">
                        {a.organizer ? <span className="muted">{a.organizer} · </span> : null}
                        <b>{a.title}</b>
                      </span>
                      <Pill tone={a.left <= 5 ? "red" : "amber"}>{a.left} posts left</Pill>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {drafts && drafts.count > 0 && (
              <section className="todo">
                <h2>
                  Article drafts <span className="c">{drafts.count}</span>
                  <Link href="/admin/articles">Articles</Link>
                </h2>
                <div className="rows">
                  <Link href="/admin/articles" className="r">
                    <span className="grow">
                      {drafts.count} {drafts.count === 1 ? "draft" : "drafts"}
                      {drafts.stale ? <span className="muted"> · {drafts.stale} untouched for over a week</span> : null}
                    </span>
                  </Link>
                </div>
              </section>
            )}
          </div>
        )}
      </Body>
    </Screen>
  );
}
