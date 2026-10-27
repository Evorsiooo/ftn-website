"use client";
import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Direction = "right" | "left" | "none";

/** Position of a path in the nav: the link whose href is the longest prefix of it, or -1. */
function navIndex(path: string, order: string[]): number {
  let best = -1;
  let bestLen = -1;
  order.forEach((href, i) => {
    if (href === "#") return;
    const hit = href === "/plus" ? path === "/plus" : path === href || path.startsWith(href + "/");
    if (hit && href.length > bestLen) {
      best = i;
      bestLen = href.length;
    }
  });
  return best;
}

function directionBetween(from: string, to: string, order: string[]): Direction {
  const a = navIndex(from, order);
  const b = navIndex(to, order);
  if (a !== b && a >= 0 && b >= 0) return b > a ? "right" : "left";
  // Same nav item (a league page inside Sports, say): going deeper comes in from the right, going back from the left.
  return to.split("/").length >= from.split("/").length ? "right" : "left";
}

/**
 * Slides each new page in from the side its nav item sits on: a page to the right of the current
 * one enters from the right, one to the left from the left. Enter-only, so the old page never blocks the new one.
 */
export function PageTransition({ order, children }: { order: string[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<{ path: string; dir: Direction }>({ path: pathname, dir: "none" });
  if (state.path !== pathname) setState({ path: pathname, dir: directionBetween(state.path, pathname, order) });

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The shell, not the window, scrolls: every page starts at the top.
    ref.current?.closest<HTMLElement>(".ott-scroll")?.scrollTo({ top: 0 });
  }, [pathname]);

  const cls = state.dir === "right" ? "ftn-slide-from-right" : state.dir === "left" ? "ftn-slide-from-left" : "ftn-page-enter";
  return (
    <div ref={ref} key={pathname} className={cls}>
      {children}
    </div>
  );
}
