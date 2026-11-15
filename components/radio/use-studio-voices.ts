"use client";
import { useEffect, useRef, useState } from "react";
import type { RadioProgram } from "@/lib/radio/program-types";
import { TALK_DUCK, TalkDetector, VoiceLink } from "./voice";

/**
 * While a Studio show is on and this browser plays the radio: receives the voices of the people
 * on air (except this browser's own), plays them over the music, and lowers the music while
 * anyone talks (this browser's own microphone counts too, so a host hears what listeners hear).
 */
export function useStudioVoices(opts: {
  program: RadioProgram | null;
  active: boolean;
  volume: number;
  muted: boolean;
  ownVoiceId: string | null;
  ownMic: MediaStream | null;
  voiceDuck: (level: number) => void;
}): { error: string | null; speaking: string[] } {
  const { program, active, volume, muted, ownVoiceId, ownMic, voiceDuck } = opts;
  const link = useRef<Promise<VoiceLink> | null>(null);
  const els = useRef(new Map<string, HTMLAudioElement>());
  const detector = useRef<TalkDetector | null>(null);
  const duckRef = useRef(voiceDuck);
  duckRef.current = voiceDuck;
  const level = useRef({ volume, muted });
  level.current = { volume, muted };
  const [error, setError] = useState<string | null>(null);
  const [speakingKeys, setSpeakingKeys] = useState<string[]>([]);

  const studio = active ? program?.studio ?? null : null;
  const wanted = (studio?.voices ?? [])
    .filter((v) => v.session && v.track && v.id !== ownVoiceId)
    .map((v) => ({ sessionId: v.session!, trackName: v.track! }));
  const wantedKey = wanted.map((w) => `${w.sessionId}/${w.trackName}`).sort().join(",");
  const on = !!studio;

  // the talk detector lives while a show is on here
  useEffect(() => {
    if (!on) return;
    const d = new TalkDetector((talking) => duckRef.current(talking ? TALK_DUCK : 1));
    d.onSpeakers = setSpeakingKeys;
    detector.current = d;
    return () => {
      d.close();
      detector.current = null;
      duckRef.current(1);
      setSpeakingKeys([]);
    };
  }, [on]);

  // this browser's own microphone ducks its own music too
  useEffect(() => {
    if (!on || !ownMic) return;
    detector.current?.add("me", ownMic);
    return () => detector.current?.remove("me");
  }, [on, ownMic]);

  // receive the voices on air, drop the ones that left
  useEffect(() => {
    if (!on) return;
    const list = wantedKey ? wantedKey.split(",") : [];
    let alive = true;
    void (async () => {
      try {
        if (!list.length && !link.current) return;
        link.current ??= VoiceLink.open().then((l) => {
          l.onTrack = (key, track) => {
            const stream = new MediaStream([track]);
            let el = els.current.get(key);
            if (!el) {
              el = new Audio();
              el.autoplay = true;
              els.current.set(key, el);
            }
            el.srcObject = stream;
            el.volume = level.current.muted ? 0 : level.current.volume;
            void el.play().catch(() => {});
            detector.current?.add(key, stream);
          };
          l.onStop = (why) => setError(why);
          return l;
        });
        const l = await link.current;
        if (!alive) return;
        const keep = new Set(list);
        await l.drop(keep);
        for (const [key, el] of els.current) {
          if (keep.has(key)) continue;
          el.srcObject = null;
          els.current.delete(key);
          detector.current?.remove(key);
        }
        await l.pull(list.map((k) => ({ sessionId: k.split("/")[0]!, trackName: k.split("/")[1]! })));
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Couldn't receive the voices.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [on, wantedKey]);

  // the show ended, or this browser stopped playing: hang up
  useEffect(() => {
    if (on) return;
    const l = link.current;
    link.current = null;
    void l?.then((x) => x.close()).catch(() => {});
    for (const el of els.current.values()) el.srcObject = null;
    els.current.clear();
  }, [on]);
  useEffect(
    () => () => {
      void link.current?.then((x) => x.close()).catch(() => {});
      link.current = null;
    },
    []
  );

  // listener volume applies to voices as well
  useEffect(() => {
    for (const el of els.current.values()) el.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // talking voices, as the people's ids ("me" is this browser's own microphone)
  const speaking = speakingKeys
    .map((k) => (k === "me" ? ownVoiceId : studio?.voices.find((v) => `${v.session}/${v.track}` === k)?.id))
    .filter((id): id is string => !!id);
  return { error, speaking };
}
