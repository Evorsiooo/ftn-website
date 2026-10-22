"use client";
import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const BARS = 28;

// Decorative waveform. It always moves; `energy` (0..1) is eased towards its target so the
// motion swells smoothly when playback starts and settles when it stops. It is synthesised
// rather than read from the stream, since cross-origin audio can't be analysed without CORS.
export function Waveform({ playing, className }: { playing: boolean; className?: string }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      barsRef.current.forEach((el) => el && (el.style.transform = "scaleY(0.35)"));
      return;
    }
    let raf = 0;
    let last = performance.now();
    let energy = 0.25;
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const target = playingRef.current ? 1 : 0.25;
      energy += (target - energy) * Math.min(1, dt * 2.5);
      const speed = 0.8 + energy * 2.2;
      const time = t / 1000;
      for (let i = 0; i < BARS; i++) {
        const el = barsRef.current[i];
        if (!el) continue;
        const wave =
          Math.sin(time * speed + i * 0.55) * 0.5 +
          Math.sin(time * speed * 1.7 + i * 1.3) * 0.3 +
          Math.sin(time * speed * 0.6 - i * 0.2) * 0.2;
        const h = 0.14 + (0.5 + wave * 0.5) * (0.18 + energy * 0.68);
        el.style.transform = `scaleY(${Math.min(1, Math.max(0.1, h)).toFixed(3)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={cn("flex items-center gap-[3px] h-6", className)} aria-hidden>
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="h-full w-[3px] rounded-full bg-brand origin-center will-change-transform"
          style={{ transform: "scaleY(0.25)" }}
        />
      ))}
    </div>
  );
}
