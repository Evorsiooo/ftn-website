"use client";
// Calling in, on the radio player (the approved mockups 08 and 10 to 14). Only there while the
// host has calls open, or when someone opens the host's link (/plus/radio?call=1).
import { useCallback, useEffect, useState } from "react";
import { useRadio } from "@/components/radio/radio-provider";
import { useMicLevel, useOnAirVoice } from "@/components/radio/use-on-air-voice";
import { getMic } from "@/components/radio/voice";
import { fetchSession } from "@/lib/session-client";
import * as I from "./icons";

type Me = { id: string; state: "waiting" | "on_air" | "left"; position: number | null } | null;
type Step = "idle" | "signin" | "mic" | "queued" | "closed" | "ended";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]!);
};

export function Meter({ lit, bars = 15 }: { lit: number; bars?: number }) {
  return (
    <div className="meter" aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <i key={i} className={i < lit ? "on" : undefined} />
      ))}
    </div>
  );
}

export function CallIn() {
  const r = useRadio();
  const studio = r.program?.studio ?? null;
  const open = !!studio?.callIn;
  const [step, setStep] = useState<Step>("idle");
  const [me, setMe] = useState<Me>(null);
  const [mic, setMic] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const level = useMicLevel(mic);

  const stopMic = useCallback(() => {
    setMic((m) => {
      m?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  // opened from the host's link (/plus/radio?call=1): straight to calling in
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("call") === "1") setStep("mic");
  }, []);

  // sign in first, then the microphone check
  useEffect(() => {
    if (step !== "mic" || mic) return;
    let alive = true;
    void fetchSession()
      .then((s) => {
        if (!alive) return;
        if (!s?.authenticated) return setStep("signin");
        return getMic().then(async (m) => {
          if (!alive) return m.getTracks().forEach((t) => t.stop());
          setMic(m);
          setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"));
        });
      })
      .catch(() => alive && setError("Your browser didn't give access to the microphone."));
    return () => {
      alive = false;
    };
  }, [step, mic]);

  // a different microphone picked
  const pick = async (id: string) => {
    setDeviceId(id);
    try {
      const m = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stopMic();
      setMic(m);
    } catch {
      setError("That microphone isn't available.");
    }
  };

  // where this caller stands, every few seconds while in line or on air
  useEffect(() => {
    if (step !== "queued") return;
    let alive = true;
    const check = () =>
      fetch("/api/radio/call", { cache: "no-store" })
        .then((res) => res.json())
        .then((d: any) => {
          if (!alive) return;
          if (!d?.me || d.me.state === "left") {
            setMe(null);
            setStep("ended");
            stopMic();
            return;
          }
          setMe(d.me);
        })
        .catch(() => {});
    void check();
    const t = setInterval(check, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [step, stopMic]);

  const report = useCallback(async (session: string, track: string) => {
    const res = await fetch("/api/radio/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "track", session, track }) });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as any)?.error || "Couldn't go on air.");
  }, []);
  const onAir = step === "queued" && me?.state === "on_air";
  const voice = useOnAirVoice({ personId: onAir ? me!.id : null, mic: onAir ? mic : null, report });

  useEffect(() => {
    mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }, [mic, muted]);

  const join = async () => {
    setError(null);
    const res = await fetch("/api/radio/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "join" }) });
    const d: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 409) setStep("closed");
      else setError(d?.error || "Couldn't join the line.");
      return;
    }
    setMe(d.me);
    setStep("queued");
    // you hear the show while you wait
    if (r.status === "idle" || r.status === "error") r.play();
  };

  const hangUp = async () => {
    await fetch("/api/radio/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "leave" }) }).catch(() => {});
    stopMic();
    setMe(null);
    setStep("idle");
  };

  const cancel = () => {
    stopMic();
    setStep("idle");
  };

  // leaving the page hangs up
  useEffect(
    () => () => {
      if (step === "queued") void fetch("/api/radio/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "leave" }), keepalive: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  if (!studio && step === "idle") return null;
  const show = studio?.title ?? "the show";

  if (step === "idle") {
    if (!open) return null;
    return (
      <div className="call">
        <button className="btn sec" onClick={() => setStep("mic")}>
          <I.Phone />
          Call in
        </button>
      </div>
    );
  }

  if (step === "closed" || ((step === "mic" || step === "signin") && !open && r.program !== null)) {
    return (
      <div className="call">
        <div className="callbox">
          <div className="t">Calls are closed</div>
          <div className="s">The host isn&apos;t taking calls right now.</div>
          <div className="acts">
            <button className="btn ghost" style={{ paddingLeft: 0 }} onClick={cancel}>
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "ended") {
    return (
      <div className="call">
        <div className="callbox">
          <div className="t">Your call has ended</div>
          <div className="s">Thanks for calling in.</div>
          <div className="acts">
            <button className="btn ghost" style={{ paddingLeft: 0 }} onClick={() => setStep("idle")}>
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "signin") {
    return (
      <div className="call">
        <div className="callbox">
          <div className="t">Call in to {show}</div>
          <div className="s">Sign in with Roblox so the host knows who&apos;s calling.</div>
          <div className="acts" style={{ display: "flex", gap: 8 }}>
            <a className="btn sec" href={`/api/auth/roblox?returnUrl=${encodeURIComponent("/plus/radio?call=1")}`}>
              Sign in with Roblox
            </a>
            <button className="btn ghost" onClick={cancel}>
              Just listen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "mic") {
    return (
      <div className="call">
        <div className="callbox">
          <div className="t">Check your microphone</div>
          {error ? <div className="s">{error}</div> : <Meter lit={level} />}
          {devices.length > 1 && (
            <label className="select">
              Microphone
              <select value={deviceId} onChange={(e) => void pick(e.target.value)}>
                <option value="">Default</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "Microphone"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="acts" style={{ display: "flex", gap: 8 }}>
            <button className="btn sec" disabled={!mic} onClick={() => void join()}>
              Join the queue
            </button>
            <button className="btn ghost" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // queued: waiting in line, or on air
  return (
    <div className="call">
      <div className="callbox">
        {onAir ? (
          <>
            <div className="t onair">You&apos;re on air</div>
            {voice.error && <div className="s">{voice.error}</div>}
            <Meter lit={muted ? 0 : level} />
            <div className="acts" style={{ display: "flex", gap: 8 }}>
              <button className="btn sec" aria-pressed={muted} onClick={() => setMuted((m) => !m)}>
                {muted ? <I.MicOff /> : <I.Mic />}
                {muted ? "Unmute" : "Mute"}
              </button>
              <button className="btn ghost" onClick={() => void hangUp()}>
                Hang up
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="t">{me?.position ? `You're ${ordinal(me.position)} in line` : "You're in line"}</div>
            <div className="s">You&apos;ll hear the show while you wait. Headphones stop the radio echoing into your call.</div>
            <Meter lit={level} />
            <div className="acts">
              <button className="btn sec" onClick={() => void hangUp()}>
                Hang up
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
