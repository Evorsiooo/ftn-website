"use client";
// Radio problem reports from the flag on the radio player (approved mockup: plans/report-problem/). Song
// reports about the same song for the same problem are one row ("3 listeners"); bugs are one row each. The
// list loads when the page opens and after each action: nothing polls it. Copy puts a report (or every new
// report) on the clipboard as plain text, diagnostics included, to paste into a chat.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, Bug, Check, Copy, ExternalLink, MoreHorizontal, Search } from "lucide-react";
import { toast, confirmDialog } from "@/components/gs/dialogs";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { BackButton, Body, Facts, PageBar, Pill, Screen, Seg, ago, formatWhen, type Tone } from "@/components/admin/ui";
import { refreshAdminSummary } from "@/lib/admin-summary";
import { canManageRadio } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { describeDiagnostics, reportsText, sourceLabel, whoSent, type ReportRow, type ReportStatus } from "@/lib/radio/reports";

type Filter = ReportStatus | "all";
type KindFilter = "all" | "song" | "bug";
type Counts = { new: number; fixed: number; dismissed: number; all: number };
/** Song reports about one song for one problem, or a single bug report. */
type Group = { id: string; kind: "song" | "bug"; reason: string; reports: ReportRow[] };

const STATUS: Record<ReportStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "amber" },
  fixed: { label: "Fixed", tone: "green" },
  dismissed: { label: "Dismissed", tone: "grey" },
};
const TZ = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const small = (url: string | null | undefined) => (url ? url.replace(/\/\d+x\d+bb\.jpg$/, "/120x120bb.jpg") : null);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

function groupReports(rows: ReportRow[]): Group[] {
  const groups: Group[] = [];
  const bySong = new Map<string, Group>();
  for (const r of rows) {
    if (r.kind === "song" && r.songKey) {
      const id = `s:${r.songKey}:${r.reason}`;
      let g = bySong.get(id);
      if (!g) {
        g = { id, kind: "song", reason: r.reason, reports: [] };
        bySong.set(id, g);
        groups.push(g);
      }
      g.reports.push(r);
    } else {
      groups.push({ id: r.id, kind: r.kind, reason: r.reason, reports: [r] });
    }
  }
  return groups;
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied. Paste it into any chat.`);
  } catch {
    toast("Couldn't copy: your browser blocked the clipboard.");
  }
}

function ReportsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("id");
  const select = (id: string | null) => router.replace(id ? `/admin/radio/reports?id=${encodeURIComponent(id)}` : "/admin/radio/reports", { scroll: false });

  const [filter, setFilter] = useState<Filter>("new");
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [counts, setCounts] = useState<Counts>({ new: 0, fixed: 0, dismissed: 0, all: 0 });
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ status: filter });
      if (kind !== "all") qs.set("kind", kind);
      const d = await api<{ reports: ReportRow[]; counts: Counts }>(`/api/admin/radio/reports?${qs}`);
      setRows(d.reports);
      setCounts(d.counts);
    } catch (err: any) {
      toast(err.message);
      setRows([]);
    }
  }, [filter, kind]);
  useEffect(() => {
    void load();
  }, [load]);

  const needle = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const list = rows ?? [];
    const hit = needle
      ? list.filter((r) => [r.reason, r.details, r.songTitle, r.songArtist, r.username].some((v) => v && v.toLowerCase().includes(needle)))
      : list;
    return groupReports(hit);
  }, [rows, needle]);
  const current = groups.find((g) => g.id === selectedId) ?? null;

  const setStatus = async (ids: string[], status: ReportStatus) => {
    setBusy(true);
    try {
      await api("/api/admin/radio/reports", { method: "PUT", body: JSON.stringify({ ids, status }) });
      refreshAdminSummary();
      // move on to the next one in the list
      const i = groups.findIndex((g) => g.id === current?.id);
      const next = groups[i + 1] ?? groups[i - 1] ?? null;
      if (filter !== "all" && filter !== status) select(next ? next.id : null);
      await load();
    } catch (err: any) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const block = async (r: ReportRow) => {
    const who = r.userId ? `@${r.username || r.userId}` : "this anonymous sender (their network)";
    if (!(await confirmDialog(`Block ${who} from sending reports for 30 days?\n\nTheir new reports are dismissed.`, { ok: "Block", danger: true }))) return;
    setBusy(true);
    try {
      const d = await api<{ message: string }>("/api/admin/radio/reports", { method: "PUT", body: JSON.stringify({ action: "block", id: r.id, days: 30 }) });
      toast(d.message);
      refreshAdminSummary();
      await load();
    } catch (err: any) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  /** Copies reports as text, with their diagnostics (read now: the list doesn't carry them). */
  const copyReports = async (ids: string[], what: string) => {
    try {
      const full = await Promise.all(ids.map((id) => api<{ report: ReportRow }>(`/api/admin/radio/reports?id=${encodeURIComponent(id)}`).then((d) => d.report)));
      await copyText(reportsText(full, TZ), what);
    } catch (err: any) {
      toast(err.message);
    }
  };
  const copyAllNew = async () => {
    setMenu(false);
    try {
      const d = await api<{ reports: ReportRow[] }>("/api/admin/radio/reports?status=new&diagnostics=1");
      if (!d.reports.length) return toast("There are no new reports.");
      await copyText(reportsText(d.reports, TZ), d.reports.length === 1 ? "1 report" : `${d.reports.length} reports`);
    } catch (err: any) {
      toast(err.message);
    }
  };
  const dismissAllNew = async () => {
    setMenu(false);
    if (!counts.new) return;
    if (!(await confirmDialog(`Dismiss all ${counts.new} new ${counts.new === 1 ? "report" : "reports"}?`, { ok: "Dismiss all" }))) return;
    try {
      const d = await api<{ reports: ReportRow[] }>("/api/admin/radio/reports?status=new");
      await setStatus(d.reports.map((r) => r.id), "dismissed");
    } catch (err: any) {
      toast(err.message);
    }
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  const filters = (["new", "fixed", "dismissed", "all"] as const).map((f) => ({ value: f, label: f === "all" ? "All" : STATUS[f].label, n: counts[f] }));
  const kinds = [
    { value: "all" as const, label: "Everything" },
    { value: "song" as const, label: "Songs" },
    { value: "bug" as const, label: "Bugs" },
  ];
  const pick = (f: Filter) => {
    setFilter(f);
    select(null);
  };
  const pickKind = (k: KindFilter) => {
    setKind(k);
    select(null);
  };

  const more = (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn icon"
        aria-label="More"
        aria-expanded={menu}
        onClick={(e) => {
          e.stopPropagation();
          setMenu((v) => !v);
        }}
      >
        <MoreHorizontal className="ic" />
      </button>
      {menu && (
        <div className="card" role="menu" style={{ position: "absolute", right: 0, top: 40, zIndex: 20, padding: 4, minWidth: 250, boxShadow: "var(--a-shadow)" }}>
          <button type="button" role="menuitem" className="btn ghost" style={{ width: "100%", justifyContent: "flex-start" }} disabled={!counts.new} onClick={copyAllNew}>
            <Copy className="ic" /> Copy all new reports{counts.new ? ` (${counts.new})` : ""}
          </button>
          <Link role="menuitem" className="btn ghost" style={{ width: "100%", justifyContent: "flex-start" }} href="/admin/settings/access">
            Who can send reports…
          </Link>
          <button type="button" role="menuitem" className="btn ghost" style={{ width: "100%", justifyContent: "flex-start" }} disabled={!counts.new || busy} onClick={dismissAllNew}>
            Dismiss all new
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Screen>
      <PageBar
        title="Reports"
        tools={
          <>
            <Seg value={filter} onChange={pick} options={filters} label="Show" />
            <Seg value={kind} onChange={pickKind} options={kinds} label="Kind" />
            <div className="search" style={{ width: 200 }}>
              <Search />
              <input className="input sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reports" aria-label="Search reports" />
            </div>
          </>
        }
        end={more}
        mrow={
          <>
            <select className="select sm" style={{ flex: 1 }} value={filter} onChange={(e) => pick(e.target.value as Filter)} aria-label="Show">
              {filters.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label} ({f.n})
                </option>
              ))}
            </select>
            <select className="select sm" style={{ flex: 1 }} value={kind} onChange={(e) => pickKind(e.target.value as KindFilter)} aria-label="Kind">
              <option value="all">Songs and bugs</option>
              <option value="song">Songs</option>
              <option value="bug">Bugs</option>
            </select>
          </>
        }
      />
      <Body>
        <div className={cn("ld", current && "detail")}>
          <div className="ld-list">
            {rows === null ? (
              <div className="empty">Loading reports…</div>
            ) : groups.length === 0 ? (
              <div className="empty">{needle ? "No report matches your search." : filter === "new" ? "No new reports. Nothing to look at." : "Nothing here."}</div>
            ) : (
              groups.map((g) => <GroupItem key={g.id} g={g} on={current?.id === g.id} onClick={() => select(g.id)} />)
            )}
          </div>
          <div className="ld-pane">
            {!current ? (
              <div className="pane-empty">{groups.length ? "Pick a report to read it." : ""}</div>
            ) : current.kind === "song" ? (
              <SongPane g={current} busy={busy} onBack={() => select(null)} onStatus={setStatus} onBlock={block} onCopy={copyReports} onChanged={load} />
            ) : (
              <BugPane r={current.reports[0]} busy={busy} onBack={() => select(null)} onStatus={setStatus} onBlock={block} onCopy={copyReports} />
            )}
          </div>
        </div>
      </Body>
    </Screen>
  );
}

function GroupItem({ g, on, onClick }: { g: Group; on: boolean; onClick: () => void }) {
  const r = g.reports[0];
  const fresh = g.reports.some((x) => x.status === "new");
  const listeners = g.reports.length;
  return (
    <button type="button" className={cn("item", on && "on")} onClick={onClick}>
      {g.kind === "song" ? (
        small(r.song?.thumbnail) ? <img className="rp-thumb" src={small(r.song?.thumbnail)!} alt="" referrerPolicy="no-referrer" /> : <span className="rp-thumb" />
      ) : (
        <span className="rp-bug">
          <Bug className="ic" />
        </span>
      )}
      <span className="grow">
        <span className="trunc" style={{ display: "block", fontWeight: fresh ? 600 : 500 }}>
          {g.reason}
          {g.kind === "song" && <span className="muted" style={{ fontWeight: 400 }}> · {r.songTitle || "Unknown song"}</span>}
        </span>
        <span className="meta">
          <span className="trunc">
            {g.kind === "song"
              ? `${listeners} ${listeners === 1 ? "listener" : "listeners"}${r.songArtist ? ` · ${r.songArtist}` : ""}`
              : `${sourceLabel(r.source)} · ${r.userId ? `@${r.username}` : "Not signed in"}${r.hasDiagnostics ? " · diagnostics" : ""}`}
          </span>
        </span>
      </span>
      <span className="t12 muted num" style={{ flex: "none" }}>
        {ago(r.createdAt).replace(" ago", "")}
      </span>
    </button>
  );
}

type PaneProps = {
  busy: boolean;
  onBack: () => void;
  onStatus: (ids: string[], status: ReportStatus) => void;
  onBlock: (r: ReportRow) => void;
  onCopy: (ids: string[], what: string) => void;
};

function StatusActions({ ids, status, busy, onStatus, onCopy, copyWhat }: { ids: string[]; status: ReportStatus; copyWhat: string } & Pick<PaneProps, "busy" | "onStatus" | "onCopy">) {
  return (
    <>
      <button type="button" className="btn sm" onClick={() => onCopy(ids, copyWhat)}>
        <Copy className="ic-sm" />
        <span className="hide-m">Copy</span>
      </button>
      {status !== "dismissed" && (
        <button type="button" className="btn sm" disabled={busy} onClick={() => onStatus(ids, "dismissed")}>
          Dismiss
        </button>
      )}
      {status !== "fixed" ? (
        <button type="button" className="btn sm strong" disabled={busy} onClick={() => onStatus(ids, "fixed")}>
          <Check className="ic-sm" />
          Mark fixed
        </button>
      ) : (
        <button type="button" className="btn sm" disabled={busy} onClick={() => onStatus(ids, "new")}>
          Reopen
        </button>
      )}
    </>
  );
}

function groupStatus(g: Group): ReportStatus {
  return g.reports.some((r) => r.status === "new") ? "new" : g.reports[0].status;
}

function SongPane({ g, busy, onBack, onStatus, onBlock, onCopy, onChanged }: PaneProps & { g: Group; onChanged: () => void }) {
  const r0 = g.reports[0];
  const song = r0.song;
  const status = groupStatus(g);
  const ids = g.reports.map((r) => r.id);
  const archive = async () => {
    if (!song) return;
    if (!(await confirmDialog(`Archive "${r0.songTitle}"?\n\nThe AutoDJ stops playing it. You can bring it back from the Song library.`, { ok: "Archive", danger: true }))) return;
    try {
      await api(`/api/admin/radio/songs/${song.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
      toast("Song archived.");
      onChanged();
    } catch (err: any) {
      toast(err.message);
    }
  };
  return (
    <>
      <div className="pane-head capped">
        <BackButton onClick={onBack} label="Back to reports" />
        <Pill tone={STATUS[status].tone} dot>
          {STATUS[status].label}
        </Pill>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <StatusActions ids={ids} status={status} busy={busy} onStatus={onStatus} onCopy={onCopy} copyWhat={ids.length === 1 ? "Report" : `${ids.length} reports`} />
        </span>
      </div>
      <div className="pane-body capped" style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <div className="card rp-song">
          {small(song?.thumbnail) ? <img src={small(song?.thumbnail)!} alt="" referrerPolicy="no-referrer" /> : <span className="rp-song-ph" />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="trunc" style={{ fontWeight: 650, fontSize: 16 }}>
              {r0.songTitle || "Unknown song"}
            </div>
            <div className="muted trunc">{r0.songArtist}</div>
            <div className="t12 muted">
              {song
                ? `${mmss(song.durationSec)} long · ${song.source === "upload" ? "uploaded" : `added from ${song.source === "youtube" ? "YouTube" : "SoundCloud"}`}${song.archived ? " · archived" : ""}`
                : "No longer in the library"}
            </div>
          </div>
          {song && (
            <Link className="btn sm hide-m" href={`/admin/radio/library?song=${encodeURIComponent(r0.songKey!)}`}>
              <ExternalLink className="ic-sm" />
              Open in library
            </Link>
          )}
        </div>
        {song && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="btn sm show-m" href={`/admin/radio/library?song=${encodeURIComponent(r0.songKey!)}`}>
              <ExternalLink className="ic-sm" />
              Open in library
            </Link>
            {!song.archived && (
              <button type="button" className="btn sm ghost danger" onClick={archive}>
                Archive song
              </button>
            )}
          </div>
        )}
        <h3 className="rp-h3">
          {g.reports.length === 1 ? "1 listener reported this" : `${g.reports.length} listeners reported this`}
          {g.reports.length > 1 && <span className="t12 muted" style={{ fontWeight: 400 }}>· newest first</span>}
        </h3>
        {g.reports.map((r) => (
          <OneReport key={r.id} r={r} onBlock={onBlock} onCopy={onCopy} />
        ))}
      </div>
    </>
  );
}

function OneReport({ r, onBlock, onCopy }: { r: ReportRow; onBlock: (r: ReportRow) => void; onCopy: (ids: string[], what: string) => void }) {
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);
  return (
    <div className="card rp-one">
      <div className="top">
        <Pill tone="grey">{r.reason}</Pill>
        <span className="t12 muted trunc">
          {r.userId ? (
            <>
              Signed in as <b>@{r.username}</b>
            </>
          ) : (
            "Not signed in"
          )}{" "}
          · {sourceLabel(r.source)} · {ago(r.createdAt)}
        </span>
        <span style={{ marginLeft: "auto", position: "relative" }}>
          <button
            type="button"
            className="iconbtn"
            style={{ width: 28, height: 28 }}
            aria-label="More"
            aria-expanded={menu}
            onClick={(e) => {
              e.stopPropagation();
              setMenu((v) => !v);
            }}
          >
            <MoreHorizontal className="ic" />
          </button>
          {menu && (
            <div className="card" role="menu" style={{ position: "absolute", right: 0, top: 32, zIndex: 20, padding: 4, minWidth: 200, boxShadow: "var(--a-shadow)" }}>
              <button type="button" role="menuitem" className="btn ghost" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => onCopy([r.id], "Report")}>
                <Copy className="ic" /> Copy this report
              </button>
              <button type="button" role="menuitem" className="btn ghost danger" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => onBlock(r)}>
                <Ban className="ic" /> Block sender
              </button>
            </div>
          )}
        </span>
      </div>
      {r.details ? <div className="txt">{r.details}</div> : <div className="muted t12">No comment.</div>}
      {r.hasDiagnostics && (
        <div>
          <button type="button" className="link t12 rp-link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? "Hide diagnostics" : "Diagnostics"}
          </button>
        </div>
      )}
      {open && <Diagnostics id={r.id} />}
    </div>
  );
}

function BugPane({ r, busy, onBack, onStatus, onBlock, onCopy }: PaneProps & { r: ReportRow }) {
  return (
    <>
      <div className="pane-head capped">
        <BackButton onClick={onBack} label="Back to reports" />
        <Pill tone={STATUS[r.status].tone} dot>
          {STATUS[r.status].label}
        </Pill>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" className="btn sm ghost danger" disabled={busy} onClick={() => onBlock(r)}>
            <Ban className="ic-sm" />
            <span className="hide-m">Block sender</span>
          </button>
          <StatusActions ids={[r.id]} status={r.status} busy={busy} onStatus={onStatus} onCopy={onCopy} copyWhat="Report" />
        </span>
      </div>
      <div className="pane-body capped" style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.25, fontWeight: 700 }}>{r.reason}</h2>
        <Facts
          rows={[
            ["Sent", formatWhen(r.createdAt)],
            ["From", sourceLabel(r.source)],
            ["Who", whoSent(r)],
            ...(r.songTitle ? ([["Playing", `${r.songTitle}${r.songArtist ? `, ${r.songArtist}` : ""}`]] as [string, string][]) : []),
          ]}
        />
        <div className="card" style={{ padding: "14px 16px", lineHeight: 1.6, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
          {r.details}
        </div>
        <h3 className="rp-h3">Diagnostics</h3>
        {r.hasDiagnostics ? <Diagnostics id={r.id} /> : <p className="muted" style={{ margin: 0 }}>The listener didn&apos;t send diagnostic data.</p>}
      </div>
    </>
  );
}

/** One report's diagnostics, read when shown. */
function Diagnostics({ id }: { id: string }) {
  const [r, setR] = useState<ReportRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setR(null);
    api<{ report: ReportRow }>(`/api/admin/radio/reports?id=${encodeURIComponent(id)}`)
      .then((d) => alive && setR(d.report))
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [id]);
  if (err) return <p className="muted">{err}</p>;
  if (!r) return <div className="card rp-diag"><div className="sec muted">Loading…</div></div>;
  const { groups, log } = describeDiagnostics(r.diagnostics);
  return (
    <div className="card rp-diag">
      {groups.map((g) => (
        <div className="sec" key={g.title}>
          <div className="k">{g.title}</div>
          <Facts rows={g.rows} />
        </div>
      ))}
      <div className="sec">
        <div className="k">Last player messages ({log.length})</div>
        <pre className="rp-log">{log.length ? log.join("\n") : "None."}</pre>
      </div>
    </div>
  );
}

export default function AdminReportsConsole() {
  return (
    <AdminAuthGuard requiredPermission={canManageRadio} featureTitle="Reports">
      <React.Suspense fallback={null}>
        <ReportsPage />
      </React.Suspense>
    </AdminAuthGuard>
  );
}
