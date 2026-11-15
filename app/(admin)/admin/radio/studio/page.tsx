"use client";
// The Studio (Broadcast role): run a show from the browser. Talk on air, queue songs (by link or
// from the library), pause the music, open calling in and bring callers on, and let other
// broadcasters join. Listeners' browsers do the playing and mixing; only voices go live.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Link2, Mic, MicOff, Pause, Play, Search, Trash2, X } from "lucide-react";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { AdminPageHeader } from "@/components/gs/admin-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { canManageRadio } from "@/lib/rbac";
import { useRadio } from "@/components/radio/radio-provider";
import { useMicLevel, useOnAirVoice } from "@/components/radio/use-on-air-voice";
import { getMic } from "@/components/radio/voice";
import { labelClass, selectClass } from "@/components/admin/schedule/styles";

type Person = { id: string; name: string; avatar: string | null; role: "host" | "cohost" | "caller"; state: "waiting" | "on_air"; connected: boolean };
type Queued = { id: string; label: string; state: string; ready: boolean };
type Usage = { bytes: number; capBytes: number; freeBytes: number; blocked: boolean; month: string };
type State = {
  session: { id: string; title: string; callIn: boolean; paused: boolean; startedAt: number } | null;
  me: { id: string; role: string } | null;
  people: Person[];
  queue: Queued[];
  cap: number;
  usage: Usage;
};
type Replay = { id: string; kind: string; title: string; hidden: boolean; startedAt: number; endedAt: number | null };
type Show = { id: string; name: string };

async function call<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
  return d as T;
}
const post = (body: Record<string, unknown>) => call("/api/admin/radio/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const gb = (b: number) => `${(b / 1e9).toFixed(b < 10e9 ? 2 : 0)} GB`;
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const card = "rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800";
const h2 = "text-lg font-extrabold mb-3";

function Avatar({ p, talking }: { p: { name: string; avatar: string | null }; talking?: boolean }) {
  const ring = talking ? "ring-4 ring-[#23a55a]" : "ring-0";
  return p.avatar ? (
    <img src={p.avatar} alt="" className={`h-10 w-10 rounded-full object-cover transition-shadow ${ring}`} />
  ) : (
    <span className={`flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200 font-bold dark:bg-neutral-800 ${ring}`}>{p.name.slice(0, 1).toUpperCase()}</span>
  );
}

export default function StudioPage() {
  const radio = useRadio();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mic, setMic] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [shows, setShows] = useState<Show[]>([]);
  const [showId, setShowId] = useState("");
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ key: string; title: string; artist: string }[]>([]);
  const [url, setUrl] = useState("");
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
    call<{ shows: Show[] }>("/api/admin/broadcasts")
      .then((d) => setShows(d.shows || []))
      .catch(() => {});
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

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await post(body);
      await load();
    } catch (e: any) {
      setError(e.message);
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
  const voice = useOnAirVoice({ personId: onAir ? state!.me!.id : null, mic: onAir ? mic : null, report });

  // library search
  useEffect(() => {
    if (!onAir || query.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      call<{ songs: { key: string; title: string; artist: string }[] }>(`/api/admin/radio/studio?q=${encodeURIComponent(query.trim())}`)
        .then((d) => setResults(d.songs))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, onAir]);

  const speaking = useMemo(() => new Set(radio.speaking), [radio.speaking]);
  const waiting = state?.people.filter((p) => p.state === "waiting") ?? [];
  const live = state?.people.filter((p) => p.state === "on_air") ?? [];
  const callLink = typeof window !== "undefined" ? `${window.location.origin}/plus/radio?call=1` : "/plus/radio?call=1";
  const usage = state?.usage;

  return (
    <AdminAuthGuard requiredPermission={canManageRadio} featureTitle="Studio">
      <div className="w-full space-y-6 text-neutral-900 dark:text-white">
        <AdminPageHeader
          title="Studio"
          description="Run a show on the radio from here: talk, queue songs, take calls. Listeners hear the music mixed in their own browser, and your voices on top."
          actions={
            <Link href="/admin/radio" className="gs-bar-link pb-0.5 text-sm font-bold">
              ← Schedule
            </Link>
          }
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {voice.error && <p className="text-sm text-red-600">{voice.error}</p>}

        {!state ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : !state.session ? (
          <div className={card}>
            <h2 className={h2}>Start a show</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Show</label>
                <Select value={showId} onChange={(e) => setShowId(e.target.value)} className={selectClass}>
                  <option value="">No show (give it a name)</option>
                  {shows.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={labelClass}>Name {showId ? "(optional)" : ""}</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Friday Night Mix" />
              </div>
            </div>
            <p className="mt-3 text-sm text-neutral-500">Your microphone goes on air as soon as you start. Use headphones so the radio doesn&apos;t echo into it.</p>
            <Button className="mt-4 h-10 cursor-pointer px-5" disabled={busy || usage?.blocked} onClick={() => void goOnAir({ op: "start", showId: showId || null, title })}>
              <Mic /> Go on air
            </Button>
          </div>
        ) : !state.me ? (
          <div className={card}>
            <h2 className={h2}>{state.session.title} is on air</h2>
            <p className="text-sm text-neutral-500">
              With {live.map((p) => p.name).join(", ") || "nobody yet"} · since {timeFmt.format(new Date(state.session.startedAt))}
            </p>
            <Button className="mt-4 h-10 cursor-pointer px-5" disabled={busy || live.length >= state.cap} onClick={() => void goOnAir({ op: "join" })}>
              <Mic /> Join as co-broadcaster
            </Button>
            {live.length >= state.cap && <p className="mt-2 text-sm text-neutral-500">{state.cap} people are already on air.</p>}
          </div>
        ) : (
          <>
            <div className={card}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold">{state.session.title}</h2>
                  <p className="text-sm text-neutral-500">
                    On air since {timeFmt.format(new Date(state.session.startedAt))} · {voice.connected ? "your microphone is live" : micAsk ? "your microphone isn't connected" : "connecting your microphone…"}
                  </p>
                  {micAsk && (
                    <Button className="mt-2 h-9 cursor-pointer px-4" onClick={() => void ensureMic().then(() => setMicAsk(false), () => setError("The browser didn't give access to the microphone. Allow it in the address bar, then try again."))}>
                      <Mic /> Connect your microphone
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-10 cursor-pointer px-4" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
                    {muted ? <MicOff /> : <Mic />} {muted ? "Unmute" : "Mute"}
                  </Button>
                  <Button variant="outline" className="h-10 cursor-pointer px-4" disabled={busy} onClick={() => void act({ op: state.session!.paused ? "resume" : "pause" })}>
                    {state.session.paused ? <Play /> : <Pause />} {state.session.paused ? "Play music" : "Pause music"}
                  </Button>
                  <Button variant="outline" className="h-10 cursor-pointer px-4" disabled={busy} onClick={() => void act({ op: "leave" })}>
                    Leave
                  </Button>
                  <Button className="h-10 cursor-pointer px-4" disabled={busy} onClick={() => window.confirm("End the show for everyone?") && void act({ op: "end" })}>
                    End show
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex h-3 gap-[3px]" aria-hidden>
                {Array.from({ length: 24 }, (_, i) => (
                  <i key={i} className={`w-1.5 rounded-sm ${!muted && i < (level * 24) / 15 ? "bg-[#23a55a]" : "bg-neutral-300 dark:bg-neutral-700"}`} />
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">The music goes down by itself while anyone talks, and back up after.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className={card}>
                <h2 className={h2}>
                  On air ({live.length} of {state.cap})
                </h2>
                <ul className="space-y-3">
                  {live.map((p) => (
                    <li key={p.id} className="flex items-center gap-3">
                      <Avatar p={p} talking={speaking.has(p.id)} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{p.name}</div>
                        <div className="text-xs text-neutral-500">
                          {p.role === "host" ? "Host" : p.role === "cohost" ? "Co-broadcaster" : "Caller"}
                          {p.connected ? "" : " · connecting"}
                        </div>
                      </div>
                      {p.id !== state.me!.id && p.role !== "host" && (
                        <Button variant="outline" size="sm" className="cursor-pointer" disabled={busy} onClick={() => void act({ op: "takeOff", id: p.id })}>
                          Take off air
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input type="checkbox" checked={state.session.callIn} disabled={busy} onChange={(e) => void act({ op: "callIn", on: e.target.checked })} />
                    Take calls
                  </label>
                  {state.session.callIn && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <code className="rounded bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-900">{callLink}</code>
                      <Button
                        size="sm"
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => {
                          void navigator.clipboard.writeText(callLink).then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          });
                        }}
                      >
                        <Link2 /> {copied ? "Copied" : "Copy link"}
                      </Button>
                    </div>
                  )}
                  {state.session.callIn && (
                    <>
                      <h3 className="mt-4 text-sm font-extrabold">Waiting ({waiting.length})</h3>
                      {waiting.length === 0 ? (
                        <p className="text-sm text-neutral-500">Nobody yet. Callers wait on the radio page until you bring them on.</p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {waiting.map((p) => (
                            <li key={p.id} className="flex items-center gap-3">
                              <Avatar p={p} />
                              <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
                              <Button size="sm" className="cursor-pointer" disabled={busy || live.length >= state.cap} onClick={() => void act({ op: "onAir", id: p.id })}>
                                Put on air
                              </Button>
                              <Button size="sm" variant="outline" className="cursor-pointer" aria-label={`Remove ${p.name}`} disabled={busy} onClick={() => void act({ op: "takeOff", id: p.id })}>
                                <X />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className={card}>
                <h2 className={h2}>Up next</h2>
                {state.queue.length === 0 ? (
                  <p className="text-sm text-neutral-500">Nothing queued: the AutoDJ picks from the library (or the show&apos;s playlist).</p>
                ) : (
                  <ol className="space-y-2">
                    {state.queue.map((q, i) => (
                      <li key={q.id} className="flex items-center gap-2">
                        <span className="w-5 text-right text-xs text-neutral-500">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {q.label}
                          {q.state === "failed" ? " · couldn't download" : !q.ready ? " · downloading…" : ""}
                        </span>
                        <button className="cursor-pointer p-1" aria-label="Move up" disabled={busy || i === 0} onClick={() => void act({ op: "move", id: q.id, dir: -1 })}>
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button className="cursor-pointer p-1" aria-label="Move down" disabled={busy || i === state.queue.length - 1} onClick={() => void act({ op: "move", id: q.id, dir: 1 })}>
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button className="cursor-pointer p-1" aria-label="Remove" disabled={busy} onClick={() => void act({ op: "remove", id: q.id })}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-2 text-xs text-neutral-500">A queued song plays within two songs: the next two are already lined up and mixed.</p>

                <div className="mt-5">
                  <label className={labelClass} htmlFor="studio-search">
                    Search the library
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                    <Input id="studio-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title or artist" className="pl-9" />
                  </div>
                  {results.length > 0 && (
                    <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                      {results.map((s) => (
                        <li key={s.key} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {s.title} · <span className="text-neutral-500">{s.artist}</span>
                          </span>
                          <Button size="sm" variant="outline" className="cursor-pointer" disabled={busy} onClick={() => void act({ op: "queueSong", key: s.key })}>
                            Queue
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <form
                  className="mt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (url.trim()) void act({ op: "queueUrl", url }).then(() => setUrl(""));
                  }}
                >
                  <label className={labelClass} htmlFor="studio-url">
                    Or paste a song link
                  </label>
                  <div className="flex gap-2">
                    <Input id="studio-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="YouTube, SoundCloud or Spotify" />
                    <Button type="submit" className="h-10 cursor-pointer px-4" disabled={busy || !url.trim()}>
                      Queue
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">It&apos;s downloaded into the library first (usually under a minute), then joins the queue.</p>
                </form>
              </div>
            </div>
          </>
        )}

        {usage && (
          <div className={card}>
            <h2 className={h2}>Voice usage this month</h2>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div className={`h-full ${usage.blocked ? "bg-red-600" : "bg-brand"}`} style={{ width: `${Math.min(100, (usage.bytes / usage.capBytes) * 100)}%` }} />
            </div>
            <p className="mt-2 text-sm text-neutral-500">
              About {gb(usage.bytes)} of the {gb(usage.capBytes)} cap (Cloudflare&apos;s free allowance is {gb(usage.freeBytes)}).{" "}
              {usage.blocked ? "Voice is off until next month." : "Voice stops by itself at the cap, so it never costs anything."}
            </p>
          </div>
        )}

        <div className={card}>
          <h2 className={h2}>Replays</h2>
          {replays.length === 0 ? (
            <p className="text-sm text-neutral-500">Shows run from the Studio, and playlist shows, are kept here to listen back to on FTN+.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {replays.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{r.title}</div>
                    <div className="text-xs text-neutral-500">
                      {dateFmt.format(new Date(r.startedAt))}
                      {r.endedAt && r.endedAt < Date.now() ? ` to ${timeFmt.format(new Date(r.endedAt))}` : " · on air"}
                      {r.hidden ? " · hidden" : ""}
                    </div>
                  </div>
                  {r.endedAt && r.endedAt < Date.now() && !r.hidden && (
                    <Link href={`/plus/radio/replays/${r.id}`} className="gs-bar-link text-sm font-bold">
                      Listen
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => void call(`/api/admin/radio/replays/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: !r.hidden }) }).then(loadReplays)}
                  >
                    {r.hidden ? "Show" : "Hide"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="cursor-pointer"
                    aria-label={`Delete ${r.title}`}
                    onClick={() => window.confirm(`Delete the replay of ${r.title} for good?`) && void call(`/api/admin/radio/replays/${r.id}`, { method: "DELETE" }).then(loadReplays)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminAuthGuard>
  );
}
