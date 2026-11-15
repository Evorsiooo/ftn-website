"use client";
import { useEffect, useState } from "react";
import type { RadioSource } from "./use-radio-player";

/** The radio bucket's public domain (see lib/radio/store.ts). */
export const RADIO_FILES = "https://radio-files.euno.cc";
const POLL_MS = 20_000;

/**
 * Where the radio's sound comes from right now: the AutoDJ, or Icecast while
 * an OBS show is live. Read from radio/live.json in the radio bucket, which
 * the every-minute cron keeps up to date (lib/radio/live.ts), so checking it
 * costs the website no requests. Only polled while [enabled].
 */
export function useRadioSource(enabled: boolean): RadioSource {
  const [source, setSource] = useState<RadioSource>("autodj");
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const check = () =>
      fetch(`${RADIO_FILES}/radio/live.json?t=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ live?: boolean }>) : { live: false }))
        .then((body) => alive && setSource(body.live ? "icecast" : "autodj"))
        .catch(() => {});
    void check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled]);
  return source;
}
