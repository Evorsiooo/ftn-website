"use client";
import { useEffect, useRef, useState } from "react";
import { useRadio } from "./radio-provider";
import { VoiceLink, VoiceRecorder, serverOffsetMs } from "./voice";

/**
 * While this browser is on air (a broadcaster in the Studio, or a caller put on air): sends the
 * microphone to the SFU, tells the website which track it is (so listeners receive it), keeps
 * its own voice out of what it plays back, and records it for the replay.
 *
 * [report] posts { session, track } to the right endpoint (Studio or call-in).
 */
export function useOnAirVoice(opts: {
  personId: string | null;
  mic: MediaStream | null;
  report: (session: string, track: string) => Promise<void>;
  /** Muted: nothing goes out (the track sent to the SFU is silenced, not only the page's own). */
  muted?: boolean;
}): { error: string | null; connected: boolean } {
  const { personId, mic } = opts;
  const radio = useRadio();
  const setOwn = radio.setOwnVoice;
  const reportRef = useRef(opts.report);
  reportRef.current = opts.report;
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const sent = useRef<MediaStreamTrack | null>(null);
  const mutedRef = useRef(!!opts.muted);
  mutedRef.current = !!opts.muted;
  useEffect(() => {
    if (sent.current) sent.current.enabled = !opts.muted;
  }, [opts.muted]);

  useEffect(() => {
    if (!personId || !mic) return;
    let alive = true;
    let link: VoiceLink | null = null;
    let recorder: VoiceRecorder | null = null;
    setOwn({ id: personId, mic });
    void (async () => {
      try {
        const track = mic.getAudioTracks()[0];
        if (!track) throw new Error("No microphone.");
        link = await VoiceLink.open();
        if (!alive) return link.close();
        link.onStop = (why) => alive && (setError(why), setConnected(false));
        // the link stops the tracks it sends when closed; send a clone so the page keeps its microphone
        const out = track.clone();
        out.enabled = !mutedRef.current;
        sent.current = out;
        const name = await link.push(out);
        await reportRef.current(link.session, name);
        if (!alive) return;
        setConnected(true);
        setError(null);
        const offset = await serverOffsetMs();
        if (!alive) return;
        recorder = new VoiceRecorder(mic, () => Date.now() + offset);
        recorder.start();
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Couldn't connect your microphone.");
      }
    })();
    return () => {
      alive = false;
      recorder?.stop();
      link?.close();
      sent.current = null;
      setOwn(null);
      setConnected(false);
    };
  }, [personId, mic, setOwn]);

  return { error, connected };
}

/** A microphone level meter: how many of [bars] are lit. */
export function useMicLevel(mic: MediaStream | null, bars = 15): number {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (!mic) return setLit(0);
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    const src = ctx.createMediaStreamSource(mic);
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const t = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]!));
      // about -48 dB to 0 dB across the bars
      const db = 20 * Math.log10(Math.max(peak, 1e-5));
      setLit(Math.max(0, Math.min(bars, Math.round(((db + 48) / 48) * bars))));
    }, 80);
    return () => {
      clearInterval(t);
      src.disconnect();
      void ctx.close().catch(() => {});
    };
  }, [mic, bars]);
  return lit;
}
