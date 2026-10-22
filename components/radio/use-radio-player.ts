"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type PlayerStatus = "idle" | "connecting" | "playing" | "buffering" | "reconnecting" | "error";

// A connection attempt shows a countdown for COUNTDOWN_MS, then plain "Buffering…" for
// GRACE_MS more, and is retried if audio still hasn't started.
export const COUNTDOWN_MS = 5000;
const GRACE_MS = 2000;
const WATCHDOG_MS = 2000;
const RETRY_MS = [1000, 2000, 4000, 8000];
const MAX_RETRIES = 6;
const HAVE_FUTURE_DATA = 3;

// Owns the <audio> element for a live stream. Icecast drops listeners for a moment when the
// source switches (AutoDJ <-> broadcaster), so a dropped, ended or frozen stream is
// reconnected with a cache-busting URL instead of being left silent.
export function useRadioPlayer(streamUrl: string, onTrackChange?: () => void) {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [volume, setVolumeState] = useState(0.8);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wantPlaying = useRef(false);
  const retries = useRef(0);
  const timers = useRef<{ pending?: ReturnType<typeof setTimeout>; retry?: ReturnType<typeof setTimeout>; watchdog?: ReturnType<typeof setInterval> }>({});
  const volumeRef = useRef(volume);
  const urlRef = useRef(streamUrl);
  const onChangeRef = useRef(onTrackChange);
  urlRef.current = streamUrl;
  onChangeRef.current = onTrackChange;

  const clearPending = () => {
    clearTimeout(timers.current.pending);
    timers.current.pending = undefined;
    setPendingSince(null);
  };

  const clearTimers = () => {
    clearTimeout(timers.current.retry);
    clearInterval(timers.current.watchdog);
    timers.current.retry = undefined;
    timers.current.watchdog = undefined;
    clearPending();
  };

  const teardown = () => {
    clearTimers();
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.onplaying = audio.onwaiting = audio.onstalled = audio.onerror = audio.onended = audio.ontimeupdate = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  };

  const start = useCallback((reconnecting: boolean) => {
    teardown();
    if (!wantPlaying.current || !urlRef.current) return;
    setStatus(reconnecting ? "reconnecting" : "connecting");

    let url = urlRef.current;
    if (reconnecting) url += `${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
    const audio = new Audio(url);
    audio.volume = volumeRef.current;
    audioRef.current = audio;

    const scheduleRetry = () => {
      if (!wantPlaying.current || timers.current.retry) return;
      clearPending();
      if (retries.current >= MAX_RETRIES) {
        wantPlaying.current = false;
        teardown();
        setStatus("error");
        return;
      }
      setStatus("reconnecting");
      const delay = RETRY_MS[Math.min(retries.current, RETRY_MS.length - 1)];
      retries.current += 1;
      timers.current.retry = setTimeout(() => {
        timers.current.retry = undefined;
        start(true);
      }, delay);
    };

    // Waiting for audio: counts down, then retries if nothing arrives.
    const beginPending = () => {
      if (timers.current.pending) return;
      setPendingSince(Date.now());
      timers.current.pending = setTimeout(() => {
        timers.current.pending = undefined;
        scheduleRetry();
      }, COUNTDOWN_MS + GRACE_MS);
    };

    const onPlaying = () => {
      clearPending();
      retries.current = 0;
      setStatus("playing");
      onChangeRef.current?.();
    };

    // "waiting"/"stalled" also fire on a healthy live stream that merely has a slow moment;
    // only treat it as buffering when playback really has run out of data.
    const onStall = () => {
      if (!wantPlaying.current || audio.readyState >= HAVE_FUTURE_DATA) return;
      setStatus((s) => (s === "playing" ? "buffering" : s));
      beginPending();
    };

    audio.onwaiting = onStall;
    audio.onstalled = onStall;
    audio.onplaying = onPlaying;
    // Recover from a stall that clears without a new "playing" event.
    audio.ontimeupdate = () => {
      if (timers.current.pending && !audio.paused && audio.readyState >= HAVE_FUTURE_DATA) onPlaying();
    };
    audio.onerror = scheduleRetry;
    audio.onended = scheduleRetry;

    // Catches a frozen stream that never fires waiting/stalled.
    let lastTime = -1;
    let frozen = 0;
    timers.current.watchdog = setInterval(() => {
      const a = audioRef.current;
      if (!a || a.paused || !wantPlaying.current) return;
      if (a.currentTime > 0 && a.currentTime === lastTime) {
        frozen += 1;
        if (frozen >= 2) {
          frozen = 0;
          scheduleRetry();
        }
      } else {
        frozen = 0;
        lastTime = a.currentTime;
      }
    }, WATCHDOG_MS);

    beginPending();
    audio.play().catch((err: any) => {
      if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
        // Autoplay blocked or interrupted by our own teardown: not a stream failure.
        if (err.name === "NotAllowedError") {
          wantPlaying.current = false;
          teardown();
          setStatus("idle");
        }
        return;
      }
      scheduleRetry();
    });
  }, []);

  const play = useCallback(() => {
    wantPlaying.current = true;
    retries.current = 0;
    start(false);
  }, [start]);

  const stop = useCallback(() => {
    wantPlaying.current = false;
    teardown();
    setStatus("idle");
  }, []);

  const setVolume = useCallback((value: number) => {
    volumeRef.current = value;
    setVolumeState(value);
    if (audioRef.current) audioRef.current.volume = value;
  }, []);

  useEffect(() => () => {
    wantPlaying.current = false;
    teardown();
  }, []);

  return { status, pendingSince, volume, setVolume, play, stop };
}
