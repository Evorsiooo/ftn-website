"use client";
import { useEffect, useState } from "react";
import { PROGRAM_KEY, airingAt, type ProgramAiring, type RadioProgram } from "@/lib/radio/program-types";
import { RADIO_FILES } from "./use-radio-source";

/**
 * radio/program.json: scheduled airings (playlist shows, stream shows) and the Studio show on
 * air (its voices, call-in, pause). Read from the radio bucket's public domain, so it costs the
 * website nothing. Polled faster while a Studio show is on (people come on and off air).
 */
export function useRadioProgram(enabled: boolean): { program: RadioProgram | null; airing: ProgramAiring | null } {
  const [program, setProgram] = useState<RadioProgram | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const studioOn = !!program?.studio;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const read = () =>
      fetch(`${RADIO_FILES}/${PROGRAM_KEY}?t=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<RadioProgram>) : null))
        .then((p) => alive && setProgram(p))
        .catch(() => {});
    void read();
    const poll = setInterval(read, studioOn ? 5000 : 20_000);
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [enabled, studioOn]);
  return { program, airing: airingAt(program, now) };
}
