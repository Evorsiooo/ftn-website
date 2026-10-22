"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { EMPTY_PLUS_NOW, type PlusNow } from "@/lib/plus-now-types";

interface PlusNowState {
  data: PlusNow;
  loaded: boolean;
}

const PlusNowContext = createContext<PlusNowState>({ data: EMPTY_PLUS_NOW, loaded: false });

const POLL_MS = 60_000;

// One shared fetch of /api/plus/now for every FTN+ promo on the news site. It starts after
// the page is idle, refreshes only while the tab is visible, and fails quietly (no promos).
export function PlusNowProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlusNowState>({ data: EMPTY_PLUS_NOW, loaded: false });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/plus/now")
        .then((res) => res.json())
        .then((data: any) => {
          if (!cancelled) setState({ data: { ...EMPTY_PLUS_NOW, ...data }, loaded: true });
        })
        .catch(() => {
          if (!cancelled) setState((s) => ({ ...s, loaded: true }));
        });
    };
    const idle = (window as any).requestIdleCallback as ((cb: () => void) => number) | undefined;
    const start = idle ? idle(load) : window.setTimeout(load, 300);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (!idle) window.clearTimeout(start);
    };
  }, []);

  return <PlusNowContext.Provider value={state}>{children}</PlusNowContext.Provider>;
}

export function usePlusNow() {
  return useContext(PlusNowContext);
}
