"use client";
export const runtime = "edge";
import { PopoutPage } from "@/components/plus/radio-ui";

/** The radio in a small window of its own (opened from the player bar, full screen or the radio page). */
export default function RadioPopout() {
  return (
    <div className="fp pop">
      <PopoutPage />
    </div>
  );
}
