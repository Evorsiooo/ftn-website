"use client";
/**
 * The radio's keyboard shortcuts: BitChord's web/app/src/shell/useKeyboardShortcuts.ts, keeping the keys a shared
 * radio has. Space listens or stops (BitChord: play/pause); ⌘/Ctrl+↑ / ↓ turn the volume up or down by 10%.
 * Left out, as a listener can't do them on a shared radio and the radio has no search: ⌘/Ctrl+→ / ← (next /
 * previous), ⌘/Ctrl+F and "/" (search). Esc already closes the full-screen radio (FullScreen in radio-ui.tsx).
 *
 * On where the radio is the page (the radio page, full screen, the popout), not across the whole site, so Space
 * still scrolls articles and controls videos elsewhere. One listener however many of those are on screen.
 */
import { useEffect, useRef } from "react";
import { useRadio } from "./radio-provider";

type Actions = { toggle: () => void; volume: () => number; setVolume: (v: number) => void };

// the most recent one on screen answers (they all drive the same radio)
const mounted: Actions[] = [];

/** Typing in a field shouldn't trigger the player. */
function typing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName);
}

function onKey(event: KeyboardEvent) {
  const player = mounted[mounted.length - 1];
  if (!player || event.defaultPrevented || event.altKey) return;
  const command = event.metaKey || event.ctrlKey;
  if (typing(event.target)) return;

  if (event.key === " " && !command) {
    // A focused button already answers Space itself.
    if ((event.target as HTMLElement | null)?.closest('button, a, [role="slider"]')) return;
    event.preventDefault();
    return player.toggle();
  }
  if (!command) return;
  switch (event.key) {
    case "ArrowUp":
      event.preventDefault();
      return player.setVolume(Math.min(1, player.volume() + 0.1));
    case "ArrowDown":
      event.preventDefault();
      return player.setVolume(Math.max(0, player.volume() - 0.1));
  }
}

export function useRadioShortcuts() {
  const r = useRadio();
  const latest = useRef<Actions | null>(null);
  const on = r.status !== "idle" && r.status !== "error" && r.status !== "off-air";
  latest.current = {
    toggle: () => (on ? r.stop() : void r.play()),
    volume: () => (r.muted ? 0 : r.volume),
    setVolume: r.setVolume,
  };
  useEffect(() => {
    const mine: Actions = {
      toggle: () => latest.current?.toggle(),
      volume: () => latest.current?.volume() ?? 0,
      setVolume: (v) => latest.current?.setVolume(v),
    };
    if (mounted.push(mine) === 1) window.addEventListener("keydown", onKey);
    return () => {
      mounted.splice(mounted.indexOf(mine), 1);
      if (!mounted.length) window.removeEventListener("keydown", onKey);
    };
  }, []);
}
