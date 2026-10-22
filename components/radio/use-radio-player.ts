"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type PlayerStatus = "idle" | "connecting" | "playing" | "buffering" | "reconnecting" | "error";

const STALL_MS = 4000;
const WATCHDOG_MS = 2000;
const RETRY_MS = [1000, 2000, 4000, 8000];
const MAX_RETRIES = 6;

// Owns the <audio> element for a live stream. Icecast drops listeners for a moment when the
// source switches (AutoDJ <-> broadcaster), so a dropped, ended or frozen stream is
// reconnected with a cache-busting URL instead of being left silent.
export function useRadioPlayer(streamUrl: string, onTrackChange?: () => void) {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [volume, setVolumeState] = useState(0.8);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wantPlaying = useRef(false);
  const retries = useRef(0);
  const timers = useRef<{ stall?: ReturnType<typeof setTimeout>; retry?: ReturnType<typeof setTimeout>; watchdog?: ReturnType<typeof setInterval> }>({});
  const volumeRef = useRef(volume);
  const urlRef = useRef(streamUrl);
  const onChangeRef = useRef(onTrackChange);
  urlRef.current = streamUrl;
  onChangeRef.current = onTrackChange;

  const clearTimers = () => {
    clearTimeout(timers.current.stall);
    clearTimeout(timers.current.retry);
    clearInterval(timers.current.watchdog);
    timers.current = {};
  };

  const teardown = () => {
    clearTimers();
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.onplaying = audio.onwaiting = audio.onstalled = audio.onerror = audio.onended = audio.onpause = null;
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

    const onStall = () => {
      if (!wantPlaying.current) return;
      setStatus((s) => (s === "playing" ? "buffering" : s));
      if (!timers.current.stall) {
        timers.current.stall = setTimeout(() => {
          timers.current.stall = undefined;
          scheduleRetry();
        }, STALL_MS);
      }
    };

    audio.onwaiting = onStall;
    audio.onstalled = onStall;
    audio.onplaying = () => {
      clearTimeout(timers.current.stall);
      timers.current.stall = undefined;
      retries.current = 0;
      setStatus("playing");
      onChangeRef.current?.();
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

  return { status, volume, setVolume, play, stop };
}
