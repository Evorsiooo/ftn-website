// Passive extras for a radio problem report. Nothing here polls or calls our servers: it listens to events
// the browser already fires (page errors, tab visibility) and times the radio's own file downloads, keeping
// the last few minutes in memory. It is only read when a listener opens the report window.

const WINDOW_MS = 5 * 60_000;
const FILES_HOST = "radio-files.euno.cc";

type Dl = { t: number; ms: number; ok: boolean; type: string };
const downloads: Dl[] = [];
const errors: { t: number; text: string }[] = [];
let installed = false;
let hiddenSince: number | null = null;
let hiddenTotalMs = 0;

export interface EnvDiagnostics {
  browserFull?: string;
  osFull?: string;
  privateWindow?: string;
  autoplay?: string;
  audioContext?: string;
  sampleRate?: number;
  outputChannels?: number;
  songFormats?: string;
  downloads?: { total: number; failed: number; slowestMs: number | null };
  decodeProblems?: number;
  tab?: string;
  hiddenSec?: number;
  battery?: string;
  dataSaver?: boolean;
  timerLateMs?: number;
  pageErrors?: string[];
  blocker?: string;
}

const prune = () => {
  const cut = Date.now() - WINDOW_MS;
  while (downloads.length && downloads[0].t < cut) downloads.shift();
  while (errors.length && errors[0].t < cut) errors.shift();
};

/** Starts the listeners once. `log` receives events worth keeping in the report's timeline. */
export function installEnvDiagnostics(log: (line: string) => void) {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const onErr = (text: string) => {
    errors.push({ t: Date.now(), text: text.slice(0, 200) });
    if (errors.length > 10) errors.shift();
  };
  window.addEventListener("error", (e) => onErr(`${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno}:${e.colno})`));
  window.addEventListener("unhandledrejection", (e) => onErr(`unhandled rejection: ${String((e.reason && (e.reason.stack || e.reason.message)) || e.reason).split("\n").slice(0, 2).join(" ")}`));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenSince = Date.now();
    else if (hiddenSince) {
      hiddenTotalMs += Date.now() - hiddenSince;
      hiddenSince = null;
    }
    log(`tab ${document.hidden ? "hidden (background or minimised)" : "visible again"}`);
  });
  if (document.hidden) hiddenSince = Date.now();
  const orig = window.fetch;
  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    const input = args[0];
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (!url.includes(FILES_HOST) || url.includes("/radio/")) return orig.apply(this, args);
    const t0 = Date.now();
    return orig.apply(this, args).then(
      (res) => {
        // the time to get the answer, then the body is read by the engine; good enough to spot slow downloads
        res.clone().arrayBuffer().then(
          () => note(t0, res.ok, res.headers.get("content-type") || ""),
          () => note(t0, false, ""),
        );
        if (!res.ok) log(`download failed: HTTP ${res.status} ${url.split("/").pop()?.slice(0, 40)}`);
        return res;
      },
      (err) => {
        note(t0, false, "");
        log(`download failed: ${String(err).slice(0, 80)}`);
        throw err;
      },
    );
  };
  function note(t0: number, ok: boolean, type: string) {
    downloads.push({ t: Date.now(), ms: Date.now() - t0, ok, type });
    if (downloads.length > 60) downloads.shift();
  }
}

/** Reads everything once, when a report is opened or sent. Takes a moment (about 60 ms), never runs otherwise. */
export async function collectEnv(recentLog: string[]): Promise<EnvDiagnostics> {
  prune();
  const out: EnvDiagnostics = {};
  const ua = navigator.userAgent;
  out.browserFull = ua.match(/(Firefox|Edg|OPR|Chrome|CriOS)\/([\d.]+)/)?.slice(1).join(" ") || ua.match(/Version\/([\d.]+).*Safari/)?.[0];
  out.osFull = ua.match(/\(([^)]*)\)/)?.[1]?.slice(0, 80);
  const tryIt = async <T>(f: () => Promise<T> | T): Promise<T | undefined> => {
    try {
      return await f();
    } catch {
      return undefined;
    }
  };
  // private window: Firefox refuses the Cache API there; Chromium gives a tiny storage quota
  if (/Firefox/.test(ua)) {
    const ok = await tryIt(() => caches.open("ftn-probe").then(() => true));
    out.privateWindow = ok ? "no" : "probably yes";
  } else {
    const q = await tryIt(() => navigator.storage.estimate());
    if (q?.quota) out.privateWindow = q.quota < 130 * 1024 * 1024 ? "probably yes" : "no";
  }
  const policy = await tryIt(() => (navigator as any).getAutoplayPolicy?.("audiocontext"));
  out.autoplay = policy ? String(policy) : "unknown";
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (Ctx) {
    const c: AudioContext | undefined = await tryIt(() => new Ctx());
    if (c) {
      out.audioContext = c.state;
      out.sampleRate = c.sampleRate;
      out.outputChannels = c.destination.maxChannelCount;
      c.close().catch(() => {});
    }
  }
  const types = [...new Set(downloads.map((d) => d.type.split(";")[0]).filter(Boolean))];
  if (types.length) out.songFormats = types.join(", ");
  const ms = downloads.filter((d) => d.ok).map((d) => d.ms);
  out.downloads = { total: downloads.length, failed: downloads.filter((d) => !d.ok).length, slowestMs: ms.length ? Math.max(...ms) : null };
  out.decodeProblems = recentLog.filter((l) => /decode|couldn't|failed|error/i.test(l)).length;
  out.tab = `${document.hidden ? "hidden" : "visible"}${document.hasFocus() ? "" : ", not focused"}`;
  out.hiddenSec = Math.round((hiddenTotalMs + (hiddenSince ? Date.now() - hiddenSince : 0)) / 1000);
  const bat: any = await tryIt(() => (navigator as any).getBattery?.());
  if (bat) out.battery = `${Math.round(bat.level * 100)}%${bat.charging ? " charging" : " on battery"}`;
  const conn = (navigator as any).connection;
  if (conn && typeof conn.saveData === "boolean") out.dataSaver = conn.saveData;
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, 50));
  out.timerLateMs = Math.max(0, Math.round(performance.now() - t0 - 50));
  out.pageErrors = errors.slice(-5).map((e) => e.text);
  const bait = document.createElement("div");
  bait.className = "adsbox ad-banner ad-placement advert";
  bait.style.cssText = "position:absolute;left:-999px;height:10px;width:10px";
  document.body.appendChild(bait);
  await new Promise((r) => setTimeout(r, 0));
  const hidden = bait.offsetHeight === 0 || getComputedStyle(bait).display === "none";
  bait.remove();
  out.blocker = hidden ? "probably (a test element was hidden)" : "no sign";
  return out;
}
