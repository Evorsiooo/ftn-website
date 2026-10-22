"use client";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

const MIN_VISIBLE_MS = 1200;
const MAX_VISIBLE_MS = 8000;

/**
 * Splash shown from first paint until the caller reports `ready`
 * (session + library loaded), held for a minimum time so the logo
 * animation is never cut short and capped so a hung request can't trap it.
 */
export function OTTLoader({ ready }: { ready: boolean }) {
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const min = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    const max = setTimeout(() => setTimedOut(true), MAX_VISIBLE_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(max);
    };
  }, []);

  const visible = !(minElapsed && ready) && !timedOut;

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key="ftn-plus-splash-loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: "easeInOut" } }}
          className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-black select-none pointer-events-none"
        >
          {/* Ambient pulsing gold glow */}
          <div className="absolute h-72 w-72 rounded-full bg-[#FFBB14]/25 blur-3xl animate-pulse" />

          {/* Logo animation container */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0, filter: "blur(8px)" }}
            animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex flex-col items-center gap-4 px-6"
          >
            {/* FTN+ Logo Image */}
            <div className="flex items-center justify-center p-2">
              <img
                src="/logos/ftnplus_textwhite_transparent.png"
                alt="FTN+"
                className="h-16 sm:h-20 w-auto object-contain max-w-[280px] drop-shadow-[0_0_35px_rgba(255,187,20,0.4)]"
              />
            </div>
          </motion.div>

          {/* Gold Accent Progress Bar */}
          <div className="absolute bottom-20 w-44 h-[2px] bg-neutral-900 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: MIN_VISIBLE_MS / 1000, ease: "easeInOut" }}
              className="h-full bg-[#FFBB14] shadow-[0_0_10px_#FFBB14]"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
