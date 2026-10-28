"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Rect = { top: number; left: number; width: number; maxHeight: number; above: boolean };

/**
 * A floating panel anchored under (or above) a trigger element. Rendered into the nearest
 * themed container so FTN+ light/dark tokens still apply, and closed on outside click,
 * Escape, and scroll/resize of the page behind it.
 */
export function PopoverPanel({
  anchor,
  open,
  onClose,
  minWidth,
  matchWidth,
  estimatedHeight = 280,
  className,
  children,
  panelRef,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  minWidth?: number;
  matchWidth?: boolean;
  estimatedHeight?: number;
  className?: string;
  children: React.ReactNode;
  panelRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const own = React.useRef<HTMLDivElement | null>(null);
  const ref = panelRef ?? own;
  const [rect, setRect] = React.useState<Rect | null>(null);

  const place = React.useCallback(() => {
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const above = spaceBelow < Math.min(estimatedHeight, 220) && spaceAbove > spaceBelow;
    const width = Math.max(matchWidth ? r.width : 0, minWidth ?? 0, 0);
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8));
    setRect({
      top: above ? r.top - 4 : r.bottom + 4,
      left,
      width,
      maxHeight: Math.max(120, above ? spaceAbove - 4 : spaceBelow - 4),
      above,
    });
  }, [anchor, estimatedHeight, matchWidth, minWidth]);

  React.useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        anchor.current?.focus();
      }
    };
    const onScroll = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      place();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onClose, place, anchor, ref]);

  if (!open || !rect || typeof document === "undefined") return null;
  const host = (anchor.current?.closest("[data-ftn-theme]") as HTMLElement | null) ?? document.body;

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: rect.left,
        top: rect.above ? undefined : rect.top,
        bottom: rect.above ? window.innerHeight - rect.top : undefined,
        width: matchWidth ? rect.width : undefined,
        minWidth: matchWidth ? Math.min(rect.width, minWidth ?? rect.width) : minWidth,
        maxHeight: rect.maxHeight,
        zIndex: 1000,
      }}
      className={cn(
        "overflow-auto rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-xl shadow-black/15 dark:border-white/15 dark:bg-neutral-900 dark:text-white",
        "animate-in fade-in-0 zoom-in-95 duration-100",
        className
      )}
    >
      {children}
    </div>,
    host
  );
}
