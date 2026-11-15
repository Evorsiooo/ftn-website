"use client";
// Radio controls shared by the radio page, the player bar, full screen and Home's radio row.
import { useRadio } from "@/components/radio/radio-provider";
import * as I from "./icons";

/** Listen, which becomes Stop. There's no pause: the radio is the same for everyone, and Listen rejoins it live. */
export function ListenButton({ big = true }: { big?: boolean }) {
  const r = useRadio();
  const on = r.status !== "idle" && r.status !== "error" && r.status !== "off-air";
  const busy = r.status === "connecting" || r.status === "reconnecting" || r.status === "buffering";
  return on ? (
    <button className={`btn main${big ? " lg" : ""}`} onClick={r.stop} aria-busy={busy}>
      <I.Stop />
      Stop
    </button>
  ) : (
    <button className={`btn main${big ? " lg" : ""}`} onClick={() => r.play()}>
      <I.Play />
      Listen
    </button>
  );
}

export function Volume() {
  const r = useRadio();
  const v = Math.round((r.muted ? 0 : r.volume) * 100);
  return (
    <label className="vol">
      <button type="button" className="volbtn" aria-label={r.muted ? "Unmute" : "Mute"} onClick={r.toggleMute}>
        {r.muted || v === 0 ? <I.VolOff /> : <I.Vol />}
      </button>
      <input type="range" min={0} max={100} value={v} aria-label="Volume" onChange={(e) => r.setVolume(+e.target.value / 100)} style={{ ["--v" as string]: `${v}%` }} />
    </label>
  );
}
