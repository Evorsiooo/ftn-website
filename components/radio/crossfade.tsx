"use client";
import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface Layer {
  id: string;
  node: React.ReactNode;
}

// Stacks the previous content under the new one and fades the new one in on top, so the
// result never dips towards the background mid-transition (as a simultaneous fade-out would).
// `id` identifies the content; `children` is captured when it changes. The first render
// is not animated.
export function Crossfade({
  id,
  children,
  duration = 0.9,
  zoom = false,
  className,
}: {
  id: string;
  children: React.ReactNode;
  duration?: number;
  /** Settle the new layer from a slightly larger scale. */
  zoom?: boolean;
  className?: string;
}) {
  const [layers, setLayers] = useState<Layer[]>([{ id, node: children }]);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setLayers((prev) => (prev[prev.length - 1].id === id ? prev : [...prev, { id, node: children }]));
  }, [id]);

  // Drop everything under the newest layer once it is fully opaque.
  useEffect(() => {
    if (layers.length < 2) return;
    const timer = setTimeout(() => setLayers((prev) => prev.slice(-1)), duration * 1000 + 100);
    return () => clearTimeout(timer);
  }, [layers, duration]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {layers.map((layer, i) => (
        <motion.div
          key={layer.id}
          className="absolute inset-0"
          initial={i === 0 && layers.length === 1 ? false : { opacity: 0, scale: zoom ? 1.06 : 1 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
        >
          {layer.node}
        </motion.div>
      ))}
    </div>
  );
}
