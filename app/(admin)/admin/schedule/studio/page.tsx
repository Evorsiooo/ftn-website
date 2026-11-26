"use client";
// The Studio (Broadcast role): run a show from the browser. Talk on air, queue songs (by link or
// from the library), pause the music, open calling in and bring callers on, and let other
// broadcasters join. Listeners' browsers do the playing and mixing; only voices go live.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Copy, Mic, MicOff, Music, Pause, Play, SkipForward, Trash2, X } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { Body, PageBar, Pill, Screen, Switch } from "@/components/admin/ui";
import { confirmDialog } from "@/components/gs/dialogs";
import { canManageRadio } from "@/lib/rbac";
import { useRadio } from "@/components/radio/radio-provider";
import { useMicLevel, useOnAirVoice } from "@/components/radio/use-on-air-voice";
import { useLineup, type LinedUp } from "@/components/radio/use-lineup";
import { getMic } from "@/components/radio/voice";
import { expandOccurrences, type Occurrence } from "@/lib/schedule-core";
import { parseBroadcast, type ApiBroadcast, type ShowRecord } from "@/lib/schedule-client";
import { hm as fmtTime } from "@/components/admin/ui";
import { useStudioPrepare } from "@/components/admin/radio-library/prepare-run";
import { StudioAddPanel } from "@/components/admin/studio/add-panel";
import { loadLibrary } from "@/components/radio/use-on-air";

type Person = { id: string; name: string; avatar: string | null; role: "host" | "cohost" | "caller"; state: "waiting" | "on_air"; connected: boolean; gain?: number };
type Queued = { id: string; label: string; state: string; ready: boolean; key?: string | null; mine?: boolean };
type Usage = { bytes: number; capBytes: number; freeBytes: number; blocked: boolean; month: string };
type State = {
  session: { id: string; title: string; callIn: boolean; paused: boolean; startedAt: number } | null;
  me: { id: string; role: string } | null;
  people: Person[];
  queue: Queued[];
  queuedKeys: string[];
  cap: number;
  usage: Usage;
};
type Replay = { id: string; kind: string; title: string; showId: string | null; hidden: boolean; startedAt: number; endedAt: number | null };
type Show = { id: string; name: string };

async function call<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
  return d as T;
}
const post = (body: Record<string, unknown>) => call("/api/admin/radio/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** A queue label, "Title · Artist", with the artist muted (a link still downloading is shown as is). */
function labelOf(label: string) {
  const i = label.indexOf(" · ");
  if (i < 0) return label;
  return (
    <>
      {label.slice(0, i)} <span className="muted">{label.slice(i + 1)}</span>
    </>
  );
}
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

function Avatar({ p, talking }: { p: { name: string; avatar: string | null }; talking?: boolean }) {
  return p.avatar ? <img src={p.avatar} alt="" className={talking ? "pic talk" : "pic"} /> : <span className={talking ? "pic talk" : "pic"}>{p.name.slice(0, 1).toUpperCase()}</span>;
}

/** Eight level bars for a microphone (level: lit bars out of 15, from useMicLevel). */
function Levels({ level, off }: { level: number; off?: boolean }) {
  const n = 8;
  return (
    <span className="levels" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const on = !off && i < Math.round((level / 15) * n);
        return <i key={i} style={{ height: `${30 + (i / (n - 1)) * 70}%`, background: on ? undefined : "var(--a-border-strong)" }} />;
      })}
    </span>
  );
}

/** This tab left a show by closing or reloading (sessionStorage), to rejoin it after a reload. */
const LEFT_KEY = "ftn-studio-left";
const REJOIN_MS = 20_000;

/**
 * One person's volume on air, for every listener (0 to 200%, 100% = as levelled). Any broadcaster
 * can set anyone's, their own included; callers can't (it isn't on their page). It's saved a
 * moment after the slider stops, and the person's browser applies it within a few seconds.
 */
function VolumeSlider({ id, name, gain, onSave }: { id: string; name: string; gain: number; onSave: (id: string, gain: number) => Promise<void> }) {
  const [v, setV] = useState(gain);
  const editing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!editing.current) setV(gain);
  }, [gain]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (next: number) => {
    setV(next);
    editing.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void onSave(id, next).finally(() => {
        editing.current = false;
      });
    }, 350);
  };
  return (
    <label className="pvol t12 muted">
      <span>Volume</span>
      <input type="range" className="range" min={0} max={2} step={0.05} value={v} onChange={(e) => change(Number(e.target.value))} onDoubleClick={() => change(1)} aria-label={`${name}'s volume`} />
      <span className="pvol-n">{Math.round(v * 100)}%</span>
    </label>
  );
}

const elapsed = (from: number) => {
  const s = Math.max(0, Math.floor((Date.now() - from) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}` : `${m} min`;
};

/** A queued song's state: Downloading, Preparing (in this tab, or the tab of whoever queued it), Ready. */
function QueueState({ q, prep }: { q: Queued; prep: "preparing" | "ready" | "waiting" | "elsewhere" | undefined }) {
  if (q.state === "failed") return <Pill tone="red">Couldn&apos;t download</Pill>;
  if (!q.ready) return <Pill tone="grey">Downloading</Pill>;
  if (prep === "ready") return <Pill tone="green">Ready</Pill>;
  if (prep === "waiting") return <Pill tone="grey">Plain crossfade</Pill>;
  return <Pill tone="yellow">Preparing</Pill>;
}

export default function StudioPage() {
  const radio = useRadio();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mic, setMic] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  // the show this Studio was opened for, from the Schedule (?b=<broadcast>&at=<airing start, ms>)
  const [occ, setOcc] = useState<Occurrence | null | undefined>(undefined);
  const [replays, setReplays] = useState<Replay[]>([]);
  const [copied, setCopied] = useState(false);
  const level = useMicLevel(mic);

  const load = useCallback(async () => {
    try {
      setState(await call<State>("/api/admin/radio/studio", { cache: "no-store" }));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  const loadReplays = useCallback(() => call<{ replays: Replay[] }>("/api/admin/radio/replays").then((d) => setReplays(d.replays)).catch(() => {}), []);

  useEffect(() => {
    void load();
    void loadReplays();
    const q = new URLSearchParams(window.location.search);
    const bid = q.get("b");
    const at = Number(q.get("at")) || Date.now();
    if (!bid) setOcc(null);
    else
      call<{ shows: ShowRecord[]; broadcasts: ApiBroadcast[] }>("/api/admin/broadcasts")
        .then((d) => {
          const b = (d.broadcasts || []).map(parseBroadcast).filter((x) => x.id === bid);
          const list = expandOccurrences(d.shows || [], b, new Date(at - 86400000), new Date(at + 8 * 86400000), false);
          setOcc(list.find((o) => o.start.getTime() === at) ?? list.find((o) => o.end.getTime() > Date.now()) ?? null);
        })
        .catch(() => setOcc(null));
    // every 5 s while the tab is visible, every 20 s while it's hidden: still within the 45 s after
    // which the server takes a silent broadcaster off air, so switching tabs doesn't end the show
    let n = 0;
    const tick = () => {
      if (document.visibilityState === "visible" || ++n % 4 === 0) void load();
    };
    const t = setInterval(tick, 5000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load, loadReplays]);

  // a volume change: saved quietly (no busy state, so the slider stays usable)
  const saveGain = useCallback(async (id: string, gain: number) => {
    try {
      await post({ op: "gain", id, gain });
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const act = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      await post(body);
      await load();
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onAir = !!state?.session && !!state.me;
  // on air here: the microphone, the radio playing, and the voice sent
  const ensureMic = async () => {
    if (mic) return mic;
    const m = await getMic();
    setMic(m);
    return m;
  };
  const goOnAir = async (body: Record<string, unknown>) => {
    try {
      await ensureMic();
    } catch {
      setError("The browser didn't give access to the microphone.");
      return;
    }
    await act(body);
    if (radio.status === "idle" || radio.status === "error") radio.play();
  };
  // on air without a microphone here (the page was reloaded, or opened in another tab while on
  // air): pick it up again. Browsers allow that without a click once the site has the permission;
  // otherwise the "Connect your microphone" button below asks.
  const [micAsk, setMicAsk] = useState(false);
  useEffect(() => {
    if (!onAir || mic) return setMicAsk(false);
    let alive = true;
    getMic()
      .then((m) => (alive ? setMic(m) : m.getTracks().forEach((t) => t.stop())))
      .catch(() => alive && setMicAsk(true));
    return () => {
      alive = false;
    };
  }, [onAir, mic]);
  useEffect(() => {
    if (state && !onAir && mic) {
      mic.getTracks().forEach((t) => t.stop());
      setMic(null);
    }
  }, [state, onAir, mic]);
  useEffect(() => {
    mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }, [mic, muted]);

  const report = useCallback(async (session: string, track: string) => {
    await post({ op: "track", session, track });
  }, []);
  // Closing the page (or going elsewhere) takes this broadcaster off air at once, like Leave. A
  // reload comes straight back: the note left in this tab's sessionStorage rejoins the same show.
  const onAirRef = useRef<{ session: string } | null>(null);
  onAirRef.current = onAir ? { session: state!.session!.id } : null;
  useEffect(() => {
    const bye = () => {
      const cur = onAirRef.current;
      if (!cur) return;
      onAirRef.current = null;
      try {
        sessionStorage.setItem(LEFT_KEY, JSON.stringify({ session: cur.session, at: Date.now() }));
      } catch {
        /* no rejoin after a reload, that's all */
      }
      void fetch("/api/admin/radio/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "leave", soft: true }), keepalive: true }).catch(() => {});
    };
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      bye();
    };
  }, []);
  const rejoinTried = useRef(false);
  useEffect(() => {
    if (!state || rejoinTried.current) return;
    rejoinTried.current = true;
    let note: { session?: string; at?: number } | null = null;
    try {
      note = JSON.parse(sessionStorage.getItem(LEFT_KEY) || "null");
      sessionStorage.removeItem(LEFT_KEY);
    } catch {
      note = null;
    }
    if (note?.session && note.at && Date.now() - note.at < REJOIN_MS && state.session?.id === note.session && !state.me) void goOnAir({ op: "join" });
  }, [state]);

  // the running order: the song on air and the songs lined up after it, each of them skippable
  const lineup = useLineup(onAir);
  const skip = (song: LinedUp) => void act({ op: "skip", k: song.k, key: song.key }).then(() => setTimeout(lineup.reload, 300));
  const from = (key: string) => (state?.queuedKeys?.includes(key) ? "Queued" : "AutoDJ");
  // Songs this broadcaster queues are prepared (title check and mixing analysis) in this tab once downloaded,
  // so they mix in properly and then join the AutoDJ's songs on air.
  const downloaded = (state?.queue ?? []).filter((q) => q.key && q.state !== "failed");
  const prepared = useStudioPrepare(
    downloaded.map((q) => q.key!),
    downloaded.filter((q) => q.mine).map((q) => q.key!)
  );

  const voice = useOnAirVoice({ personId: onAir ? state!.me!.id : null, mic: onAir ? mic : null, report, muted });

  // how many songs the AutoDJ has (the Library tab's count), from the radio's own cached song list
  const [libraryCount, setLibraryCount] = useState<number | null>(null);
  useEffect(() => {
    if (onAir) void loadLibrary().then((songs) => setLibraryCount(songs.filter((s) => s.autodj !== false).length));
  }, [onAir]);

  // past episodes of this show (by its show, else its name); every replay when no show is open
  const scope = occ ? { showId: occ.show && !occ.show.oneOff ? occ.show.id : null, title: occ.title } : state?.session ? { showId: null, title: state.session.title } : null;
  const shown = scope ? replays.filter((r) => (scope.showId ? r.showId === scope.showId : r.title === scope.title)) : replays;
  const speaking = useMemo(() => new Set(radio.speaking), [radio.speaking]);
  const waiting = state?.people.filter((p) => p.state === "waiting") ?? [];
  const live = state?.people.filter((p) => p.state === "on_air") ?? [];
  const callLink = typeof window !== "undefined" ? `${window.location.origin}/plus/radio?call=1` : "/plus/radio?call=1";
  const usage = state?.usage;
  const queuedNow = useMemo(() => new Set((state?.queue ?? []).filter((q) => q.key && q.state === "queued").map((q) => q.key!)), [state?.queue]);

  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const roleName = (p: Person) => (p.role === "host" ? "Host" : p.role === "cohost" ? "Co-host" : "Caller");
  const endShow = async () => {
    if (await confirmDialog("End the show for everyone? The AutoDJ takes over.", { ok: "End show", danger: true })) void act({ op: "end" });
  };
  const copyLink = () =>
    void navigator.clipboard.writeText(callLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  const title = state?.session?.title ?? occ?.title ?? "Studio";
  const when = occ ? `${occ.start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} ${fmtTime(occ.start)} – ${fmtTime(occ.end)}` : null;
  const imOn = !!state?.session && !!state?.me;

  return (
    <AdminAuthGuard requiredPermission={canManageRadio} featureTitle="Studio">
      <Screen>
        <PageBar
          crumb={{ href: "/admin/schedule", label: "Schedule" }}
          title={title}
          tools={
            state?.session ? (
              <>
                <Pill tone="red" dot>
                  On air {elapsed(state.session.startedAt)}
                </Pill>
                <span className="t12 muted trunc">
                  Since {timeFmt.format(new Date(state.session.startedAt))}
                  {occ ? ` · until ${fmtTime(occ.end)}` : ""}
                  {radio.listeners != null ? ` · ${radio.listeners} listening` : ""}
                </span>
              </>
            ) : when ? (
              <span className="muted trunc">{when}{occ?.presenter ? ` · ${occ.presenter}` : ""}</span>
            ) : null
          }
          end={
            imOn ? (
              <>
                <button type="button" className="btn ghost hide-m" disabled={busy} onClick={() => void act({ op: "leave" })} title="Leave the show; it carries on without you">
                  Leave
                </button>
                <button type="button" className={muted ? "btn strong has-lbl-m" : "btn has-lbl-m"} onClick={() => setMuted((m) => !m)} aria-pressed={muted} aria-label={muted ? "Unmute me" : "Mute me"}>
                  {muted ? <MicOff className="ic" /> : <Mic className="ic" />}
                  <span className="lbl-m">{muted ? "Unmute me" : "Mute me"}</span>
                </button>
                <button type="button" className="btn danger" disabled={busy} onClick={endShow}>
                  End show
                </button>
              </>
            ) : null
          }
        />
        {(error || voice.error) && (
          <div className="notice warn">
            <span className="trunc">{error || voice.error}</span>
            {error && (
              <button type="button" className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => setError(null)}>
                Dismiss
              </button>
            )}
          </div>
        )}
        {usage?.blocked && (
          <div className="notice warn">
            <span className="trunc">This month&apos;s voice allowance is used up: voice is off until next month.</span>
          </div>
        )}
        <Body scroll={!imOn}>
          {!state || (!state.session && occ === undefined) ? (
            <div className="pane-empty">Loading the Studio…</div>
          ) : !imOn ? (
            <div className="today">
              <section className="card" style={{ padding: 20, display: "grid", gap: 12 }}>
                {!state.session ? (
                  occ ? (
                    <>
                      <h2 className="t16" style={{ margin: 0, fontWeight: 600 }}>Ready when you are</h2>
                      <p className="muted" style={{ margin: 0 }}>
                        Your microphone goes on air as soon as you press the button. Use headphones so the radio doesn&apos;t echo into it. Until then, the AutoDJ plays.
                      </p>
                      <div>
                        <button type="button" className="btn primary lg" disabled={busy || usage?.blocked} onClick={() => void goOnAir({ op: "start", showId: occ.show && !occ.show.oneOff ? occ.show.id : null, title: occ.title, artUrl: occ.show?.oneOff ? occ.artUrl : null })}>
                          <Mic className="ic" /> Go on air
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="t16" style={{ margin: 0, fontWeight: 600 }}>Open a show to go on air</h2>
                      <p className="muted" style={{ margin: 0 }}>Shows are made on the Schedule. Pick one there, then Open Studio.</p>
                      <div>
                        <Link href="/admin/schedule" className="btn strong">
                          Go to the Schedule
                        </Link>
                      </div>
                    </>
                  )
                ) : (
                  <>
                    <h2 className="t16" style={{ margin: 0, fontWeight: 600 }}>{state.session.title} is on air</h2>
                    <p className="muted" style={{ margin: 0 }}>
                      With {live.map((p) => p.name).join(", ") || "nobody yet"} · since {timeFmt.format(new Date(state.session.startedAt))}
                    </p>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <button type="button" className="btn primary" disabled={busy || live.length >= state.cap} onClick={() => void goOnAir({ op: "join" })}>
                        <Mic className="ic" /> Join as co-host
                      </button>
                      {live.length >= state.cap && <span className="help">{state.cap} people are already on air.</span>}
                    </div>
                  </>
                )}
              </section>
              <Replays scope={scope} shown={shown} reload={loadReplays} />
            </div>
          ) : (
            <div className="studio2">
              <div className="left">
                <section aria-label="On air">
                  <div className="col-head">
                    <h2>On air</h2>
                    <span className="t12 muted">
                      {live.length} of {state.cap}
                    </span>
                  </div>
                  <div className="col-body">
                    {live.map((p) => {
                      const isMe = p.id === state.me!.id;
                      return (
                        <div key={p.id} className="person">
                          <Avatar p={p} talking={speaking.has(p.id)} />
                          <div className="grow" style={{ flex: 1, minWidth: 0 }}>
                            <div className="trunc" style={{ fontWeight: 600 }}>
                              {p.name}
                              {isMe ? " (you)" : ""}
                            </div>
                            <div className="t12 muted">
                              {roleName(p)}
                              {isMe ? (muted ? " · muted" : voice.connected ? " · mic live" : micAsk ? " · mic not connected" : " · connecting…") : p.connected ? "" : " · connecting"}
                            </div>
                            <VolumeSlider id={p.id} name={isMe ? "Your" : p.name} gain={p.gain ?? 1} onSave={saveGain} />
                          </div>
                          {isMe && <Levels level={level} off={muted} />}
                          {!isMe && p.role !== "host" && (
                            <button type="button" className="btn sm" disabled={busy} onClick={() => void act({ op: "takeOff", id: p.id })}>
                              Take off
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {micAsk && (
                      <button
                        type="button"
                        className="btn strong"
                        onClick={() => void ensureMic().then(() => setMicAsk(false), () => setError("The browser didn't give access to the microphone. Allow it in the address bar, then try again."))}
                      >
                        <Mic className="ic" /> Connect your microphone
                      </button>
                    )}
                  </div>
                </section>

                <section aria-label="Callers">
                  <div className="col-head">
                    <h2>Callers</h2>
                    <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }} className="t12 muted">
                      {state.session!.callIn ? "Calls open" : "Calls closed"}
                      <Switch checked={state.session!.callIn} disabled={busy} onChange={(on) => void act({ op: "callIn", on })} label="Take calls" />
                    </label>
                  </div>
                  {state.session!.callIn && (
                    <div className="col-body">
                      <div style={{ display: "flex", gap: 8 }}>
                        <input className="input sm" readOnly value={callLink} style={{ flex: 1, minWidth: 0 }} onFocus={(e) => e.currentTarget.select()} aria-label="Call link" />
                        <button type="button" className="btn sm" onClick={copyLink}>
                          <Copy className="ic-sm" /> {copied ? "Copied" : "Copy link"}
                        </button>
                      </div>
                      <div className="sublabel">Waiting ({waiting.length})</div>
                      {waiting.map((p) => (
                        <div key={p.id} className="person">
                          <Avatar p={p} />
                          <span className="trunc" style={{ flex: 1, fontWeight: 600 }}>
                            {p.name}
                          </span>
                          <button type="button" className="btn sm strong" disabled={busy || live.length >= state.cap} onClick={() => void act({ op: "onAir", id: p.id })}>
                            Put on air
                          </button>
                          <button type="button" className="iconbtn" aria-label={`Remove ${p.name}`} disabled={busy} onClick={() => void act({ op: "takeOff", id: p.id })}>
                            <X className="ic" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <section className="music" aria-label="Music">
                <div className="col-head">
                  <h2>Music</h2>
                  <button type="button" className="btn sm" style={{ marginLeft: "auto" }} disabled={busy} onClick={() => void act({ op: state.session!.paused ? "resume" : "pause" })}>
                    {state.session!.paused ? <Play className="ic-sm" /> : <Pause className="ic-sm" />}
                    {state.session!.paused ? "Play music" : "Pause music"}
                  </button>
                </div>
                <div className="q">
                  <div className="np">
                    {lineup.onAir?.art && !state.session!.paused ? (
                      <img className="cover" src={lineup.onAir.art} alt="" />
                    ) : (
                      <span className="cover" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        {state.session!.paused ? <Pause className="ic" /> : <Music className="ic faint" />}
                      </span>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="t12 muted">{state.session!.paused ? "Paused" : lineup.onAir ? `Playing now · ${from(lineup.onAir.key)}` : "Playing now"}</div>
                      <div className="trunc" style={{ fontWeight: 600 }}>
                        {lineup.onAir ? lineup.onAir.title : radio.song ? radio.song.title : "AutoDJ"}
                      </div>
                      {(lineup.onAir || radio.song) && <div className="trunc muted">{lineup.onAir ? lineup.onAir.artist : radio.song!.artist}</div>}
                    </div>
                    {lineup.onAir && !state.session!.paused && (
                      <button type="button" className="btn sm" disabled={busy} onClick={() => skip(lineup.onAir!)} title="Skip this song for everyone">
                        <SkipForward className="ic-sm" /> Skip
                      </button>
                    )}
                  </div>

                  {lineup.next.length > 0 && (
                    <>
                      <div className="sublabel">Up next</div>
                      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
                        {lineup.next.map((n) => (
                          <li key={n.k} className="song">
                            {n.art ? <img className="cover" src={n.art} alt="" /> : <span className="cover" />}
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span className="trunc" style={{ display: "block" }}>
                                {n.title} <span className="muted">· {n.artist}</span>
                              </span>
                              <span className="t12 muted">
                                {from(n.key)} · {fmtTime(new Date(n.startMs - lineup.serverNow() + Date.now()))}
                              </span>
                            </span>
                            <button type="button" className="iconbtn" aria-label={`Skip ${n.title}`} title="Skip this song" disabled={busy || state.session!.paused} onClick={() => skip(n)}>
                              <SkipForward className="ic-sm" />
                            </button>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}

                  <div className="sublabel">Your queue</div>
                  {state.queue.length === 0 ? (
                    <p className="muted" style={{ margin: 0 }}>
                      Nothing queued.
                    </p>
                  ) : (
                    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
                      {state.queue.map((q, i) => (
                        <li key={q.id} className="song">
                          <span className="t12 faint num" style={{ width: 16, textAlign: "right" }}>
                            {i + 1}
                          </span>
                          <span className="trunc" style={{ flex: 1 }}>
                            {labelOf(q.label)}
                          </span>
                          <QueueState q={q} prep={q.key ? prepared[q.key] : undefined} />
                          <button type="button" className="iconbtn" aria-label="Move up" disabled={busy || i === 0} onClick={() => void act({ op: "move", id: q.id, dir: -1 })}>
                            <ArrowUp className="ic-sm" />
                          </button>
                          <button type="button" className="iconbtn" aria-label="Move down" disabled={busy || i === state.queue.length - 1} onClick={() => void act({ op: "move", id: q.id, dir: 1 })}>
                            <ArrowDown className="ic-sm" />
                          </button>
                          <button type="button" className="iconbtn" aria-label="Remove" disabled={busy} onClick={() => void act({ op: "remove", id: q.id })}>
                            <Trash2 className="ic-sm" />
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <StudioAddPanel
                  busy={busy}
                  queuedKeys={queuedNow}
                  readyCount={state.queue.filter((q) => q.ready).length}
                  libraryCount={libraryCount}
                  act={act}
                />
              </section>
            </div>
          )}
        </Body>
      </Screen>
    </AdminAuthGuard>
  );
}

function Replays({ scope, shown, reload }: { scope: { title: string } | null; shown: Replay[]; reload: () => void }) {
  const remove = async (r: Replay) => {
    if (!(await confirmDialog(`Delete the replay of ${r.title} for good?`, { ok: "Delete", danger: true }))) return;
    await call(`/api/admin/radio/replays/${r.id}`, { method: "DELETE" }).catch(() => {});
    reload();
  };
  return (
    <section className="todo">
      <h2>
        {scope ? `Past episodes of ${scope.title}` : "Replays"} <span className="c">{shown.length || ""}</span>
      </h2>
      {shown.length === 0 ? (
        <div className="rows">
          <div className="r muted">Shows run from the Studio, and playlist shows, are kept here to listen back to on FTN+.</div>
        </div>
      ) : (
        <div className="rows">
          {shown.map((r) => {
            const ended = !!r.endedAt && r.endedAt < Date.now();
            return (
              <div key={r.id} className="r">
                <div className="grow">
                  <div className="trunc" style={{ fontWeight: 600 }}>
                    {r.title}
                  </div>
                  <div className="t12 muted">
                    {dateFmt.format(new Date(r.startedAt))}
                    {ended ? ` to ${timeFmt.format(new Date(r.endedAt!))}` : " · on air"}
                    {r.hidden ? " · hidden" : ""}
                  </div>
                </div>
                {ended && !r.hidden && (
                  <Link href={`/plus/radio/replays/${r.id}`} className="btn sm ghost">
                    Listen
                  </Link>
                )}
                <button
                  type="button"
                  className="btn sm"
                  onClick={() =>
                    void call(`/api/admin/radio/replays/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: !r.hidden }) }).then(reload)
                  }
                >
                  {r.hidden ? "Show" : "Hide"}
                </button>
                <button type="button" className="iconbtn" aria-label={`Delete ${r.title}`} onClick={() => void remove(r)}>
                  <Trash2 className="ic-sm" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
