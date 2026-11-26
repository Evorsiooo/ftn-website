// Radio problem reports (the flag on the radio player): what can be reported, the diagnostics a listener may
// attach, and how a report reads as plain text (the admin's Copy buttons and the AI tools use the same text).
// Shared by the browser and the server, so nothing here touches the DOM or the database.

export const SONG_REASONS = ["Too long", "Wrong song", "Wrong title or artist", "Bad sound", "Wrong lyrics", "Not for the radio", "Other"] as const;
export const BUG_REASONS = ["Sound cuts out", "Won't play", "Lyrics out of time", "Page looks broken", "Something else"] as const;
export type ReportKind = "song" | "bug";
export type ReportStatus = "new" | "fixed" | "dismissed";
export const REPORT_SOURCES = { page: "Radio page", full: "Full screen", popout: "Popout player" } as const;
export type ReportSource = keyof typeof REPORT_SOURCES;

export const MAX_DETAILS = 500;
export const MAX_DIAGNOSTICS = 8_000;
export const LOG_LINES = 20;

/** What the listener's browser attaches when they tick "Send diagnostic data". Every field is optional. */
export interface ReportDiagnostics {
  device?: { browser?: string; os?: string; type?: string; screen?: string; language?: string; timeZone?: string };
  player?: {
    status?: string;
    source?: string;
    volume?: number;
    muted?: boolean;
    /** The radio plays in another window (popout or another tab) and this one only shows it. */
    otherWindow?: boolean;
    song?: string | null;
    positionSec?: number | null;
  };
  engine?: {
    offsetMs?: number | null;
    roundTripMs?: number | null;
    outputLatencyMs?: number | null;
    audioState?: string | null;
    nextMix?: { style?: string; inSec?: number } | null;
    songsLinedUp?: number | null;
    rev?: number | null;
    maxFreezeMs?: number | null;
  } | null;
  log?: string[];
}

export interface ReportRow {
  id: string;
  kind: ReportKind;
  reason: string;
  songKey: string | null;
  songTitle: string | null;
  songArtist: string | null;
  details: string;
  source: string;
  userId: string | null;
  username: string | null;
  status: ReportStatus;
  createdAt: string;
  hasDiagnostics: boolean;
  diagnostics?: ReportDiagnostics | null;
  /** The library song the report is about, when it is still in the library (admin only). */
  song?: { id: string; archived: boolean; durationSec: number; thumbnail: string | null; source: string } | null;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const ms = (n: number) => `${Math.round(n)} ms`;
const STATUS_WORDS: Record<string, string> = {
  playing: "Playing",
  buffering: "Buffering",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  error: "Error",
  idle: "Stopped",
  "off-air": "Off air",
};
const SOURCE_WORDS: Record<string, string> = { autodj: "the AutoDJ", icecast: "a live show (Icecast)", stream: "a stream show" };

export type DiagGroup = { title: string; rows: [string, string][] };

/** The diagnostics in plain words, grouped as the report window and the admin page show them. */
export function describeDiagnostics(d: ReportDiagnostics | null | undefined): { groups: DiagGroup[]; log: string[] } {
  if (!d) return { groups: [], log: [] };
  const groups: DiagGroup[] = [];
  const dev = d.device;
  if (dev) {
    const rows: [string, string][] = [];
    if (dev.browser || dev.os) rows.push(["Browser", [dev.browser, dev.os].filter(Boolean).join(" on ")]);
    if (dev.type || dev.screen) rows.push(["Device", [dev.type, dev.screen ? `screen ${dev.screen}` : ""].filter(Boolean).join(", ")]);
    if (dev.language) rows.push(["Language", dev.language]);
    if (dev.timeZone) rows.push(["Time zone", dev.timeZone]);
    if (rows.length) groups.push({ title: "Device", rows });
  }
  const p = d.player;
  const e = d.engine;
  const rows: [string, string][] = [];
  if (p) {
    if (p.otherWindow) rows.push(["State", "Playing in another window (popout or another tab)"]);
    else if (p.status) {
      const what = p.status === "playing" || p.status === "buffering" ? ` ${SOURCE_WORDS[p.source ?? ""] ?? ""}` : "";
      const vol = typeof p.volume === "number" ? `, volume ${p.muted ? "muted" : `${Math.round(p.volume * 100)}%`}` : "";
      rows.push(["State", `${STATUS_WORDS[p.status] ?? p.status}${what}${vol}`.trim()]);
    }
    if (p.song) rows.push(["Song", `${p.song}${typeof p.positionSec === "number" ? `, ${mmss(p.positionSec)} in` : ""}`]);
  }
  if (e) {
    if (e.nextMix && typeof e.nextMix.inSec === "number") rows.push(["Next mix", `${e.nextMix.style || "Mix"} in ${mmss(Math.max(0, e.nextMix.inSec))}`]);
    if (typeof e.offsetMs === "number") {
      rows.push(["In step", `${ms(Math.abs(e.offsetMs))} from the station's clock${typeof e.roundTripMs === "number" ? ` (network round trip ${ms(e.roundTripMs)})` : ""}`]);
    }
    if (typeof e.outputLatencyMs === "number") rows.push(["Sound delay", `${ms(e.outputLatencyMs)} (speakers and browser)`]);
    if (e.audioState && e.audioState !== "running") rows.push(["Audio", `Browser audio is ${e.audioState}`]);
    if (typeof e.maxFreezeMs === "number") rows.push(["Longest freeze", e.maxFreezeMs >= 1000 ? `${(e.maxFreezeMs / 1000).toFixed(1)} s` : ms(e.maxFreezeMs)]);
    if (typeof e.songsLinedUp === "number") rows.push(["Songs lined up", `${e.songsLinedUp}${typeof e.rev === "number" ? ` (running order v${e.rev})` : ""}`]);
  }
  if (rows.length) groups.push({ title: "The player", rows });
  return { groups, log: Array.isArray(d.log) ? d.log.slice(-LOG_LINES) : [] };
}

/** "Signed in as @name" or "Not signed in". */
export function whoSent(r: { userId: string | null; username: string | null }): string {
  return r.userId ? `Signed in as @${r.username || r.userId}` : "Not signed in";
}

export function sourceLabel(source: string): string {
  return (REPORT_SOURCES as Record<string, string>)[source] ?? source;
}

/** One report as plain text, to paste into a chat. */
export function reportText(r: ReportRow, timeZone?: string): string {
  const when = new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone });
  const lines = [
    `FTN radio report (${r.kind === "song" ? "song" : "bug"}): ${r.reason}`,
    `Status: ${r.status} · Sent: ${when}${timeZone ? ` (${timeZone})` : ""} · From: ${sourceLabel(r.source)} · ${whoSent(r)}`,
  ];
  if (r.songTitle) lines.push(`Song: ${r.songTitle}${r.songArtist ? `, ${r.songArtist}` : ""}${r.songKey ? ` [${r.songKey}]` : ""}`);
  lines.push(`What they wrote: ${r.details || "(nothing)"}`);
  const diag = describeDiagnostics(r.diagnostics);
  if (diag.groups.length || diag.log.length) {
    for (const g of diag.groups) lines.push(`${g.title}: ${g.rows.map(([k, v]) => `${k.toLowerCase()} ${v}`).join("; ")}`);
    if (diag.log.length) lines.push("Last player messages:", ...diag.log);
  } else if (!r.hasDiagnostics) {
    lines.push("No diagnostic data.");
  }
  return lines.join("\n");
}

export function reportsText(rows: ReportRow[], timeZone?: string): string {
  return rows.map((r) => reportText(r, timeZone)).join("\n\n---\n\n");
}

/** Keeps only the known fields of what a browser sent, with sane sizes (it's stored as given otherwise). */
export function cleanDiagnostics(raw: unknown): ReportDiagnostics | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  const str = (v: unknown, n = 120) => (typeof v === "string" ? v.replace(/<[^>]*>/g, "").slice(0, n) : undefined);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const out: ReportDiagnostics = {};
  if (r.device && typeof r.device === "object") {
    const d = r.device;
    out.device = { browser: str(d.browser, 60), os: str(d.os, 60), type: str(d.type, 20), screen: str(d.screen, 20), language: str(d.language, 40), timeZone: str(d.timeZone, 60) };
  }
  if (r.player && typeof r.player === "object") {
    const p = r.player;
    out.player = {
      status: str(p.status, 20),
      source: str(p.source, 20),
      volume: num(p.volume),
      muted: typeof p.muted === "boolean" ? p.muted : undefined,
      otherWindow: typeof p.otherWindow === "boolean" ? p.otherWindow : undefined,
      song: str(p.song, 300) ?? null,
      positionSec: num(p.positionSec) ?? null,
    };
  }
  if (r.engine && typeof r.engine === "object") {
    const e = r.engine;
    out.engine = {
      offsetMs: num(e.offsetMs) ?? null,
      roundTripMs: num(e.roundTripMs) ?? null,
      outputLatencyMs: num(e.outputLatencyMs) ?? null,
      audioState: str(e.audioState, 20),
      nextMix: e.nextMix && typeof e.nextMix === "object" ? { style: str(e.nextMix.style, 40), inSec: num(e.nextMix.inSec) } : null,
      songsLinedUp: num(e.songsLinedUp) ?? null,
      rev: num(e.rev) ?? null,
      maxFreezeMs: num(e.maxFreezeMs) ?? null,
    };
  }
  if (Array.isArray(r.log)) out.log = r.log.filter((l: unknown) => typeof l === "string").slice(-LOG_LINES).map((l: string) => str(l, 300)!);
  return out;
}
