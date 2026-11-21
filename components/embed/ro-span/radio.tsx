"use client";
// RO-SPAN's FTN radio player (served at /embed/ro-span/radio, shown in an iframe in ro-span.org's sidebar).
// Styled to sit in their sidebar boxes: Arial, navy #1a1a6e, square corners, dotted #bbb rules.
// They paste their own box and header around the iframe; this is the box's body.
import { useEffect } from "react";
import { useRadio } from "@/components/radio/radio-provider";
import { loadStationModule } from "@/components/radio/use-radio-player";
import { useNowPlaying } from "@/components/radio/use-now-playing";
import { useStationView } from "@/components/plus/radio-ui";
import "./radio.css";

const whenFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
// "Tue 4:30 PM" (Intl puts a comma after the day)
const when = (start: string) => whenFmt.format(new Date(start)).replace(",", "");

const Play = () => (
  <svg viewBox="0 0 10 10" aria-hidden>
    <path d="M1 0l9 5-9 5z" />
  </svg>
);
const Pause = () => (
  <svg viewBox="0 0 10 10" aria-hidden>
    <path d="M1 0h3v10H1zM6 0h3v10H6z" />
  </svg>
);
const Speaker = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 16 16" aria-hidden>
    {off ? (
      <path d="M2 6h3l4-3v10l-4-3H2zM11 6l1-1 1.5 1.5L15 5l1 1-1.5 1.5L16 9l-1 1-1.5-1.5L12 10l-1-1 1.5-1.5z" />
    ) : (
      <path d="M2 6h3l4-3v10l-4-3H2zM11 5.5a3.5 3.5 0 010 5l-.8-.8a2.4 2.4 0 000-3.4zM12.8 3.7a6 6 0 010 8.6l-.8-.8a4.9 4.9 0 000-7z" />
    )}
  </svg>
);
const Bars = () => (
  <span className="bars" aria-hidden>
    <i />
    <i />
    <i />
  </span>
);

export function RoSpanRadio() {
  const r = useRadio();
  const v = useStationView();
  const { info } = useNowPlaying(30_000);

  // Fetch the AutoDJ engine while idle, so pressing Listen doesn't wait for the download.
  useEffect(() => {
    const go = () => void loadStationModule().catch(() => {});
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(go, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(go, 1500);
    return () => clearTimeout(t);
  }, []);

  const on = r.status !== "idle" && r.status !== "error" && r.status !== "off-air";
  const busy = r.status === "connecting" || r.status === "reconnecting" || r.status === "buffering";
  // a show: a Studio or scheduled show over the AutoDJ (its name differs from the song's), or a hosted stream
  const show = v.mode === "hosted" || (v.mode === "autodj" && !!v.songTitle && v.name !== v.songTitle);
  const offAir = v.mode === "offair";
  const loading = v.mode === "loading";

  const label = loading ? "FTN Radio" : offAir ? "Off air" : show ? "On air" : "Now playing";
  const title = loading ? "" : offAir ? "FTN Radio" : v.name;
  const by = offAir ? "Back soon" : v.by;
  const next = info?.nextShow ? { k: "Next:", t: `${info.nextShow.name}, ${when(info.nextShow.start)}` } : null;
  // during a show, the line under the controls is the song playing in it
  const line = show && v.songTitle ? { k: "Song:", t: `${v.songTitle}, ${v.songArtist}` } : next;
  const vol = Math.round((r.muted ? 0 : r.volume) * 100);

  return (
    <div className="rsx">
      <div className="w">
        <div className="np">
          <div className="art" style={v.art ? { backgroundImage: `url("${v.art}")` } : undefined} />
          <div className="meta">
            <div className={`lab${on && !offAir ? " on" : ""}`}>
              {on && !offAir && <Bars />}
              {label}
            </div>
            <div className="title">{title}</div>
            <div className="artist">{by}</div>
          </div>
        </div>
        <div className="ctl">
          {offAir || loading ? null : on ? (
            <>
              <button className="btn" onClick={r.stop} aria-busy={busy}>
                <Pause />
                Pause
              </button>
              <label className="vol">
                <button type="button" className="spk" aria-label={r.muted ? "Unmute" : "Mute"} onClick={r.toggleMute}>
                  <Speaker off={r.muted || vol === 0} />
                </button>
                <input type="range" min={0} max={100} value={vol} aria-label="Volume" onChange={(e) => r.setVolume(+e.target.value / 100)} style={{ ["--v" as string]: `${vol}%` }} />
              </label>
            </>
          ) : (
            <button className="btn full" onClick={() => r.play()}>
              <Play />
              Listen live
            </button>
          )}
        </div>
        <div className="next">
          {line && (
            <>
              <b>{line.k}</b> {line.t}
            </>
          )}
        </div>
      </div>
      <div className="foot">
        <a href="/plus/radio" target="_blank" rel="noopener">
          Open FTN+ Radio ›
        </a>
        <img src="/logos/ftnplus_text_transparent.png" alt="FTN+" />
      </div>
    </div>
  );
}
