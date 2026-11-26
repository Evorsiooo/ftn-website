"use client";
// "Report a problem": the flag after thumbs up/down on the radio page, in full screen and in the popout. One
// window: report a song (which one, what's wrong) or something that isn't working, with an optional comment
// and, only if the listener ticks it, the player's diagnostic data ("See exactly what's sent" shows the real
// values first). Nothing is fetched until the window opens. Approved mockups: plans/report-problem/.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRadio } from "@/components/radio/radio-provider";
import { loadLibrary, serverOffset } from "@/components/radio/use-on-air";
import { RADIO_FILES } from "@/components/radio/use-radio-source";
import { useSiteConfig } from "@/lib/site-config-context";
import { recentlyPlayed, type RadioTimeline } from "@/lib/radio/autodj";
import { BUG_REASONS, MAX_DETAILS, REPORT_SOURCES, SONG_REASONS, describeDiagnostics, type ReportDiagnostics, type ReportSource } from "@/lib/radio/reports";
import * as I from "./icons";

type Song = { key: string; title: string; artist: string; art: string | null; when: string };
type Config = { access: "public" | "members_only" | "off"; signedIn: boolean; username: string | null; turnstileSiteKey: string | null };
type View = "form" | "data" | "sent";

const small = (url: string | null) => (url ? url.replace(/\/\d+x\d+bb\.jpg$/, "/120x120bb.jpg") : null);

/** Browser, system and device from the user agent, in plain words (no fingerprinting: nothing else is read). */
function device(): NonNullable<ReportDiagnostics["device"]> {
  const ua = navigator.userAgent;
  const m = (re: RegExp) => ua.match(re)?.[1];
  const browser = m(/Edg\/(\d+)/)
    ? `Edge ${m(/Edg\/(\d+)/)}`
    : m(/OPR\/(\d+)/)
      ? `Opera ${m(/OPR\/(\d+)/)}`
      : m(/Firefox\/(\d+)/)
        ? `Firefox ${m(/Firefox\/(\d+)/)}`
        : m(/CriOS\/(\d+)/)
          ? `Chrome ${m(/CriOS\/(\d+)/)}`
          : m(/Chrome\/(\d+)/)
            ? `Chrome ${m(/Chrome\/(\d+)/)}`
            : m(/Version\/(\d+(?:\.\d+)?).*Safari/)
              ? `Safari ${m(/Version\/(\d+(?:\.\d+)?).*Safari/)}`
              : "Unknown browser";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? `iOS ${(m(/OS (\d+)_/) ?? "").trim()}`.trim()
    : /Android/.test(ua)
      ? `Android ${m(/Android (\d+)/) ?? ""}`.trim()
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? navigator.maxTouchPoints > 1
            ? "iPadOS"
            : "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "Unknown system";
  const phone = /Mobi|iPhone|Android.*Mobile/.test(ua);
  const tablet = !phone && (/iPad|Tablet|Android/.test(ua) || (/Mac OS X/.test(ua) && navigator.maxTouchPoints > 1));
  let language = navigator.language;
  try {
    language = new Intl.DisplayNames(["en"], { type: "language" }).of(navigator.language) ?? navigator.language;
  } catch {}
  return {
    browser,
    os,
    type: phone ? "Phone" : tablet ? "Tablet" : "Computer",
    screen: `${screen.width} × ${screen.height}`,
    language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

async function loadRecent(): Promise<{ key: string; title: string; artist: string; art: string | null }[]> {
  const [library, skew, tl] = await Promise.all([
    loadLibrary(),
    serverOffset(),
    fetch(`${RADIO_FILES}/radio/autodj.json?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<RadioTimeline>) : null))
      .catch(() => null),
  ]);
  return recentlyPlayed(tl, library, Date.now() + skew, 3);
}

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id?: string) => void };
  }
}
let turnstileScript: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  turnstileScript ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      turnstileScript = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return turnstileScript;
}

export function ReportButton({ songKey, songTitle, songArtist, art, source }: { songKey: string | null; songTitle: string; songArtist: string; art: string | null; source: ReportSource }) {
  const { reportsAccess } = useSiteConfig();
  // the song on air when the flag was pressed (it may change while the window is open)
  const [open, setOpen] = useState<{ current: Song | null } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  if (reportsAccess === "off") return null;
  return (
    <>
      <button
        ref={button}
        className="ib"
        aria-label="Report a problem"
        aria-haspopup="dialog"
        aria-expanded={!!open}
        onClick={() => setOpen({ current: songKey ? { key: songKey, title: songTitle, artist: songArtist, art: small(art), when: "Playing now" } : null })}
      >
        <I.Flag />
      </button>
      {open && (
        <ReportWindow
          current={open.current}
          source={source}
          anchor={button}
          onClose={() => {
            setOpen(null);
            button.current?.focus();
          }}
        />
      )}
    </>
  );
}

function ReportWindow({ current, source, anchor, onClose }: { current: Song | null; source: ReportSource; anchor: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const r = useRadio();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<View>("form");
  const [kind, setKind] = useState<"song" | "bug">(current ? "song" : "bug");
  const [songs, setSongs] = useState<Song[] | null>(current ? [current] : null);
  const [pick, setPick] = useState(0);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [diag, setDiag] = useState(false);
  const [snapshot, setSnapshot] = useState<ReportDiagnostics | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  const widget = useRef<string | null>(null);
  const tsBox = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHost(anchor.current?.closest<HTMLElement>(".fp") ?? document.body);
  }, [anchor]);

  // what this window needs, read once it opens
  useEffect(() => {
    let alive = true;
    fetch("/api/radio/reports", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Config>) : null))
      .then((c) => alive && setConfig(c ?? { access: "public", signedIn: false, username: null, turnstileSiteKey: null }))
      .catch(() => alive && setConfig({ access: "public", signedIn: false, username: null, turnstileSiteKey: null }));
    void loadRecent()
      .then((list) => {
        if (!alive) return;
        const before = list.filter((s) => s.key !== current?.key).slice(0, 2);
        const rows: Song[] = [...(current ? [current] : []), ...before.map((s, i) => ({ ...s, art: small(s.art), when: i === 0 ? (current ? "Before this" : "Last song") : "2 songs ago" }))];
        setSongs(rows);
      })
      .catch(() => alive && setSongs(current ? [current] : []));
    return () => {
      alive = false;
    };
  }, [current]);

  // the invisible "is this a person" check, only when the site has its keys
  useEffect(() => {
    const key = config?.turnstileSiteKey;
    if (!key || !tsBox.current) return;
    let alive = true;
    void loadTurnstile()
      .then(() => {
        if (!alive || !tsBox.current || !window.turnstile) return;
        widget.current = window.turnstile.render(tsBox.current, {
          sitekey: key,
          appearance: "interaction-only",
          callback: (t: string) => (token.current = t),
          "expired-callback": () => (token.current = null),
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [config?.turnstileSiteKey]);

  // no page scrolling behind the window; Escape closes it (or goes back from "What's sent")
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (view === "data") setView("form");
      else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [view, onClose]);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("[data-first]")?.focus();
  }, [view, host]);

  const collect = useCallback((): ReportDiagnostics => {
    const d = r.diagnostics();
    return { device: device(), player: d.player, engine: d.engine, log: d.log };
  }, [r]);

  const showData = () => {
    setSnapshot(collect());
    setView("data");
  };

  const reasons = kind === "song" ? SONG_REASONS : BUG_REASONS;
  const song = kind === "song" ? songs?.[pick] ?? null : null;
  const canSend = !busy && !!reason && (kind === "song" ? !!song : details.trim().length >= 5);
  const blockedBySignIn = config?.access === "members_only" && !config.signedIn;

  const send = async () => {
    if (!canSend) return;
    if (config?.turnstileSiteKey && !token.current) {
      setError("Checking that you're a person… try again in a moment.");
      return;
    }
    setBusy(true);
    setError(null);
    const playing = r.song;
    try {
      const res = await fetch("/api/radio/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          reason,
          source,
          details: details.trim(),
          songKey: song?.key ?? playing?.key ?? null,
          songTitle: song?.title ?? playing?.title ?? null,
          songArtist: song?.artist ?? playing?.artist ?? null,
          diagnostics: diag ? collect() : null,
          turnstileToken: token.current,
        }),
      });
      const d: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error || "Couldn't send the report. Please try again.");
        token.current = null;
        if (widget.current) window.turnstile?.reset(widget.current);
        return;
      }
      setView("sent");
    } catch {
      setError("Couldn't send the report. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const switchKind = (k: "song" | "bug") => {
    if (k === kind) return;
    setKind(k);
    setReason(null);
    setError(null);
  };

  const head = (title: string, back?: () => void) => (
    <div className="rpt-h">
      {back && (
        <button className="ib back" aria-label="Back" onClick={back} data-first>
          <I.ArrowLeft />
        </button>
      )}
      <h2 id="rpt-title">{title}</h2>
      <button className="ib" aria-label="Close" onClick={onClose} {...(back ? {} : { "data-first": true })}>
        <I.Close />
      </button>
    </div>
  );

  let body: React.ReactNode;
  if (view === "sent") {
    body = (
      <>
        {head("")}
        <div className="rpt-b">
          <div className="done">
            <div className="ok">
              <I.Check />
            </div>
            <h3>Thanks, it&apos;s sent</h3>
            <p>The radio team will look at it. You don&apos;t need to do anything else.</p>
          </div>
        </div>
        <div className="rpt-f">
          <button className="btn main" onClick={onClose}>
            Done
          </button>
        </div>
      </>
    );
  } else if (view === "data") {
    const { groups, log } = describeDiagnostics(snapshot);
    body = (
      <>
        {head("What's sent", () => setView("form"))}
        <div className="rpt-b">
          <p className="intro">Only if you tick the box. This is the real data from your browser right now.</p>
          {groups.map((g) => (
            <div key={g.title}>
              <div className="grp">{g.title === "Device" ? "Your device" : g.title}</div>
              <dl>
                {g.rows.map(([k, v]) => (
                  <div key={k} className="row">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
                {g.title === "Device" && (
                  <div className="row">
                    <dt>Sent from</dt>
                    <dd>{REPORT_SOURCES[source]}</dd>
                  </div>
                )}
              </dl>
            </div>
          ))}
          <div className="grp">Last player messages</div>
          <pre className="log">{log.length ? log.join("\n") : "None yet."}</pre>
          <div className="never">
            <b>Never sent:</b> your IP address, other tabs, your files, or anything typed elsewhere.
          </div>
        </div>
        <div className="rpt-f">
          <button className="btn main" onClick={() => setView("form")}>
            Back
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {head("Report a problem")}
        <div className="rpt-b">
          {blockedBySignIn ? (
            <p className="intro">Sign in with Roblox to report a problem.</p>
          ) : (
            <>
              <div className="rpt-seg" role="radiogroup" aria-label="What to report">
                <button role="radio" aria-checked={kind === "song"} onClick={() => switchKind("song")}>
                  A song
                </button>
                <button role="radio" aria-checked={kind === "bug"} onClick={() => switchKind("bug")}>
                  Something isn&apos;t working
                </button>
              </div>
              {kind === "song" && (
                <>
                  <div className="lbl" id="rpt-which">
                    Which song?
                  </div>
                  <div className="songs" role="radiogroup" aria-labelledby="rpt-which">
                    {songs === null ? (
                      <div className="song-o ph" aria-busy="true" />
                    ) : songs.length === 0 ? (
                      <p className="intro">There&apos;s no song to report right now.</p>
                    ) : (
                      songs.map((s, i) => (
                        <button key={s.key} className="song-o" role="radio" aria-checked={i === pick} onClick={() => setPick(i)}>
                          {s.art ? <img src={s.art} alt="" referrerPolicy="no-referrer" /> : <span className="ph" />}
                          <span className="t">
                            <span className="a">{s.title}</span>
                            <span className="b">{s.artist}</span>
                          </span>
                          <time>{s.when}</time>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
              <div className="lbl" id="rpt-why">
                {kind === "song" ? "What's wrong with it?" : "What's happening?"}
              </div>
              <div className="chips" role="radiogroup" aria-labelledby="rpt-why">
                {reasons.map((c) => (
                  <button key={c} className="chip" role="radio" aria-checked={reason === c} onClick={() => setReason(c)}>
                    {c}
                  </button>
                ))}
              </div>
              <label className="lbl" htmlFor="rpt-details">
                {kind === "song" ? "Anything to add?" : "Describe it"}
                {kind === "song" && <small>Optional</small>}
              </label>
              <textarea
                id="rpt-details"
                value={details}
                maxLength={MAX_DETAILS}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={kind === "song" ? "For example: it keeps going for minutes after the music ends" : "What happened, and when?"}
              />
              {details.length > MAX_DETAILS - 100 && (
                <div className="count">
                  {details.length} / {MAX_DETAILS}
                </div>
              )}
              <div className={`chk${diag ? " on" : ""}`}>
                <button className="box" role="checkbox" aria-checked={diag} aria-labelledby="rpt-diag" onClick={() => setDiag((v) => !v)}>
                  <I.Check />
                </button>
                <span>
                  <span className="tt" id="rpt-diag" onClick={() => setDiag((v) => !v)}>
                    Send diagnostic data
                  </span>
                  <span className="ss">
                    Helps us find the problem.{" "}
                    <button className="lnk" onClick={showData}>
                      See exactly what&apos;s sent
                    </button>
                  </span>
                </span>
              </div>
              {config && <div className="who">{config.signedIn ? `Sent as @${config.username}.` : "You're not signed in, so this report is anonymous."}</div>}
              {error && (
                <div className="err" role="alert">
                  {error}
                </div>
              )}
              <div ref={tsBox} className="ts" />
            </>
          )}
        </div>
        <div className="rpt-f">
          {blockedBySignIn ? (
            <a className="btn main" href={`/api/auth/roblox?returnUrl=${encodeURIComponent(location.pathname)}`}>
              Sign in
            </a>
          ) : (
            <>
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn main" onClick={send} disabled={!canSend} aria-busy={busy}>
                {busy ? "Sending…" : "Send report"}
              </button>
            </>
          )}
        </div>
      </>
    );
  }

  if (!host) return null;
  return createPortal(
    <>
      <div className="rpt-scrim" aria-hidden onClick={onClose} />
      <div ref={box} className={`rpt${source === "popout" ? " popfill" : ""}`} role="dialog" aria-modal="true" aria-labelledby="rpt-title">
        {body}
      </div>
    </>,
    host,
  );
}
