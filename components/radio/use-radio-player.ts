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
const CHANNEL = "ftn-radio-player";
const VOLUME_KEY = "ftn_radio_volume";
const MUTED_KEY = "ftn_radio_muted";
const HANDOFF_FADE_MS = 700;

function readStored(): { volume: number; muted: boolean } {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "");
    return { volume: Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8, muted: localStorage.getItem(MUTED_KEY) === "1" };
  } catch {
    return { volume: 0.8, muted: false };
  }
}

// Owns the <audio> element for a live stream. Icecast drops listeners for a moment when the
// source switches (AutoDJ <-> broadcaster), so a dropped, ended or frozen stream is
// reconnected with a cache-busting URL instead of being left silent.
export function useRadioPlayer(streamUrl: string, onTrackChange?: () => void) {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMutedState] = useState(false);
  // Another window (main page or pop-out) is the one playing right now.
  const [remotePlaying, setRemotePlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wantPlaying = useRef(false);
  const retries = useRef(0);
  const timers = useRef<{ pending?: ReturnType<typeof setTimeout>; retry?: ReturnType<typeof setTimeout>; watchdog?: ReturnType<typeof setInterval> }>({});
  const volumeRef = useRef(volume);
  const mutedRef = useRef(false);
  const fadeIn = useRef(false);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const remoteOwner = useRef<string | null>(null);
  const claimed = useRef(false);
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

  const applyVolume = (audio: HTMLAudioElement | null = audioRef.current) => {
    if (!audio) return;
    audio.muted = mutedRef.current;
    audio.volume = volumeRef.current;
  };

  // Smoothly moves the element's volume to a level (used for the window handoff).
  const ramp = (audio: HTMLAudioElement, from: number, to: number, done?: () => void) => {
    clearInterval(fadeTimer.current);
    const steps = 14;
    let i = 0;
    audio.volume = from;
    fadeTimer.current = setInterval(() => {
      i += 1;
      audio.volume = Math.min(1, Math.max(0, from + ((to - from) * i) / steps));
      if (i >= steps) {
        clearInterval(fadeTimer.current);
        fadeTimer.current = undefined;
        done?.();
      }
    }, HANDOFF_FADE_MS / steps);
  };

  const teardown = () => {
    clearInterval(fadeTimer.current);
    fadeTimer.current = undefined;
    claimed.current = false;
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
    if (fadeIn.current) audio.volume = 0;
    if (fadeIn.current) audio.muted = mutedRef.current;
    else applyVolume(audio);
    audioRef.current = audio;

    const scheduleRetry = () => {
      if (!wantPlaying.current || timers.current.retry) return;
      clearPending();
      if (retries.current >= MAX_RETRIES) {
        wantPlaying.current = false;
        teardown();
        setStatus("error");
        channelRef.current?.postMessage({ type: "release", from: instanceId.current });
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
      // Tell the other windows we are really playing: they fade out and hand over to us.
      if (!claimed.current) {
        claimed.current = true;
        remoteOwner.current = null;
        setRemotePlaying(false);
        channelRef.current?.postMessage({ type: "claim", from: instanceId.current });
        if (fadeIn.current && !mutedRef.current) ramp(audio, 0, volumeRef.current);
        fadeIn.current = false;
      }
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

  // One window plays at a time. Windows talk over a BroadcastChannel: the one that is really
  // playing "claims" the radio, the others yield (with a short crossfade) and show its state.
  const channelRef = useRef<BroadcastChannel | null>(null);
  const instanceId = useRef(Math.random().toString(36).slice(2));

  const play = useCallback((opts?: { handoff?: boolean }) => {
    wantPlaying.current = true;
    retries.current = 0;
    fadeIn.current = !!opts?.handoff;
    start(false);
  }, [start]);

  // Stops this window's audio and, if another window is the one playing, asks it to stop.
  const stop = useCallback(() => {
    if (wantPlaying.current || audioRef.current) {
      wantPlaying.current = false;
      teardown();
      setStatus("idle");
      channelRef.current?.postMessage({ type: "release", from: instanceId.current });
    } else {
      channelRef.current?.postMessage({ type: "command", action: "stop", from: instanceId.current });
      remoteOwner.current = null;
      setRemotePlaying(false);
    }
  }, []);

  const setVolume = useCallback((value: number) => {
    volumeRef.current = value;
    setVolumeState(value);
    mutedRef.current = false;
    setMutedState(false);
    applyVolume();
    try {
      localStorage.setItem(VOLUME_KEY, String(value));
      localStorage.removeItem(MUTED_KEY);
    } catch {}
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMutedState(next);
    applyVolume();
    try {
      if (next) localStorage.setItem(MUTED_KEY, "1");
      else localStorage.removeItem(MUTED_KEY);
    } catch {}
  }, []);

  // Remembered volume, shared with every window through the storage event.
  useEffect(() => {
    const stored = readStored();
    volumeRef.current = stored.volume;
    mutedRef.current = stored.muted;
    setVolumeState(stored.volume);
    setMutedState(stored.muted);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== VOLUME_KEY && e.key !== MUTED_KEY) return;
      const next = readStored();
      volumeRef.current = next.volume;
      mutedRef.current = next.muted;
      setVolumeState(next.volume);
      setMutedState(next.muted);
      if (!fadeTimer.current) applyVolume();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL);
    channelRef.current = channel;
    const me = instanceId.current;
    channel.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.from === me) return;
      if (msg.type === "claim") {
        remoteOwner.current = msg.from;
        setRemotePlaying(true);
        if (wantPlaying.current) {
          // Yield to the window that is now really playing.
          wantPlaying.current = false;
          const audio = audioRef.current;
          const finish = () => {
            teardown();
            setStatus("idle");
          };
          if (audio && claimed.current && !audio.paused) ramp(audio, audio.volume, 0, finish);
          else finish();
        }
      } else if (msg.type === "release") {
        if (remoteOwner.current === msg.from) {
          remoteOwner.current = null;
          setRemotePlaying(false);
        }
      } else if (msg.type === "hello") {
        if (claimed.current && wantPlaying.current) channel.postMessage({ type: "present", from: me });
      } else if (msg.type === "present") {
        remoteOwner.current = msg.from;
        setRemotePlaying(true);
      } else if (msg.type === "command" && msg.action === "stop") {
        if (wantPlaying.current || audioRef.current) {
          wantPlaying.current = false;
          teardown();
          setStatus("idle");
          channel.postMessage({ type: "release", from: me });
        }
      }
    };
    channel.postMessage({ type: "hello", from: me });
    const onHide = () => {
      if (claimed.current) channel.postMessage({ type: "release", from: me });
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      channel.close();
      channelRef.current = null;
    };
  }, []);

  useEffect(() => () => {
    wantPlaying.current = false;
    teardown();
  }, []);

  // A window that is only listening to another one shows that as playing.
  const shownStatus: PlayerStatus = status === "idle" && remotePlaying ? "playing" : status;
  return { status: shownStatus, localStatus: status, remotePlaying, pendingSince, volume, muted, setVolume, toggleMute, play, stop };
}
