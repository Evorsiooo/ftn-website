"use client";
import { useEffect, useState } from "react";

// Which people on air are this browser itself, shared by every tab and the popout (one origin,
// one localStorage). Without it, a host on air in the Studio with FTN+ radio playing in another
// tab or the popout hears their own voice back from the SFU, a second or so late.
//
// Each on-air tab refreshes its entry while it stays on air; entries left behind by a tab that
// closed without cleaning up run out on their own.

const KEY = "ftn-radio-own-voices";
const TTL_MS = 60_000;
export const OWN_REFRESH_MS = 20_000;

type Entries = Record<string, number>;

function read(): Entries {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Entries;
    const now = Date.now();
    const out: Entries = {};
    for (const [id, until] of Object.entries(raw)) if (typeof until === "number" && until > now) out[id] = until;
    return out;
  } catch {
    return {};
  }
}

function write(e: Entries): void {
  try {
    if (Object.keys(e).length) localStorage.setItem(KEY, JSON.stringify(e));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the tab's own state still covers the tab itself */
  }
}

/** Marks [id] as this browser's own voice (on), or not any more (off). */
export function markOwnVoice(id: string, on: boolean): void {
  const e = read();
  if (on) e[id] = Date.now() + TTL_MS;
  else delete e[id];
  write(e);
}

/** The ids of the people on air that are this browser (any tab), kept up to date. */
export function useOwnVoiceIds(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => {
      const next = Object.keys(read()).sort();
      setIds((cur) => (cur.join(",") === next.join(",") ? cur : next));
    };
    sync();
    const onStorage = (ev: StorageEvent) => (ev.key === KEY || ev.key === null) && sync();
    window.addEventListener("storage", onStorage);
    const t = setInterval(sync, 10_000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(t);
    };
  }, []);
  return ids;
}
