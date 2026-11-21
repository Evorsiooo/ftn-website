"use client";
// A song's lyrics, chosen here for every listener: BitChord's provider picker (LyricsPanel.tsx ProviderPicker:
// "Best available", then each provider with how its search went) and its lyrics offset (LyricsOffsetSheet.kt:
// -5.0 s to +5.0 s in 0.1 s steps, minus, slider, plus, reset), plus "No lyrics". The preview is the radio's own
// lyrics (am-lyrics on FTN+'s colours) following this page's player, so the choice can be checked by ear; a line
// plays the song from there, as in BitChord.
import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { toast } from "@/components/gs/dialogs";
import { LyricsView, loadLyricsModule, type FoundLyrics, type LyricsModule, type Playhead, type SourceState } from "@/components/plus/lyrics-view";
import { LYRICS_OFFSET_STEP_MS, MAX_LYRICS_OFFSET_MS, MIN_LYRICS_OFFSET_MS } from "@/lib/radio/lyrics-choice";
import { api, type Song } from "./types";
import type { usePreview } from "./songs";

const BEST = "";
const NONE = "none";

/** "+0.3 s" (LyricsOffsetSheet.kt formatOffset). */
const formatOffset = (ms: number) => `${ms > 0 ? "+" : ms < 0 ? "−" : "+"}${Math.abs(ms / 1000).toFixed(1)} s`;

const stateLabel: Record<SourceState, string> = { pending: "searching…", found: "found", missing: "not found" };

export function SongLyrics({
  song,
  preview,
  onPatched,
}: {
  song: Song;
  preview: ReturnType<typeof usePreview>;
  onPatched: (id: string, patch: Partial<Song>) => void;
}) {
  const [mod, setMod] = useState<LyricsModule | null>(null);
  const [states, setStates] = useState<Record<string, SourceState>>({});
  const [best, setBest] = useState<FoundLyrics | null | undefined>(undefined);
  const [source, setSource] = useState<string>(song.lyricsSource ?? BEST);
  const [offsetMs, setOffsetMs] = useState(song.lyricsOffsetMs ?? 0);
  const [shown, setShown] = useState<FoundLyrics | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSource(song.lyricsSource ?? BEST);
    setOffsetMs(song.lyricsOffsetMs ?? 0);
  }, [song.id, song.lyricsSource, song.lyricsOffsetMs]);

  // Every provider asked at once, as the radio's own lookup does; each one's answer is shown in the list.
  useEffect(() => {
    let alive = true;
    setStates({});
    setBest(undefined);
    loadLyricsModule()
      .then((m) => {
        if (!alive) return;
        setMod(m);
        return m.findLyrics(
          { key: song.key, title: song.title, artist: song.artist, durationSec: song.durationSec },
          { onSource: (id, state) => alive && setStates((s) => ({ ...s, [id]: state })) }
        );
      })
      .then((found) => alive && setBest(found ?? null))
      .catch(() => alive && setBest(null));
    return () => {
      alive = false;
    };
  }, [song.key, song.title, song.artist, song.durationSec]);

  // The lyrics for the provider picked here: the best answer, or that provider's own.
  useEffect(() => {
    if (source === NONE) return setShown(null);
    if (source === BEST) return setShown(best);
    if (!mod) return setShown(undefined);
    let alive = true;
    setShown(undefined);
    mod
      .findLyrics({ key: song.key, title: song.title, artist: song.artist, durationSec: song.durationSec }, { only: source })
      .then((found) => alive && setShown(found ?? null))
      .catch(() => alive && setShown(null));
    return () => {
      alive = false;
    };
  }, [source, best, mod, song.key, song.title, song.artist, song.durationSec]);

  // Where this page's player is in the song: BitChord's LyricsView reads the element every frame.
  const key = song.key;
  const playingThis = preview.playing === key;
  const read = useRef<() => Playhead>(() => null);
  read.current = () => {
    const el = preview.element();
    if (!el || !playingThis) return { sec: 0, paused: true };
    return { sec: el.currentTime, paused: el.paused };
  };
  const playhead = useRef(() => read.current()).current;

  const changed = source !== (song.lyricsSource ?? BEST) || offsetMs !== (song.lyricsOffsetMs ?? 0);
  const save = async () => {
    setBusy(true);
    try {
      const lyricsSource = source === BEST ? null : source;
      await api(`/api/admin/radio/songs/${song.id}`, { method: "PATCH", body: JSON.stringify({ lyricsSource, lyricsOffsetMs: offsetMs }) });
      onPatched(song.id, { lyricsSource, lyricsOffsetMs: offsetMs });
      toast("Lyrics saved. Listeners get them within a minute.");
    } catch (err: any) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const step = (by: number) => setOffsetMs((o) => Math.min(MAX_LYRICS_OFFSET_MS, Math.max(MIN_LYRICS_OFFSET_MS, o + by)));
  const sources = mod?.lyricSources ?? [];
  const bestLabel = best === undefined ? "Best available (searching…)" : best ? `Best available (${best.source})` : "Best available (none found)";

  return (
    <section className="song-lyrics" aria-label="Lyrics">
      <div className="lbl">Lyrics</div>
      <select className="select" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Lyrics provider">
        <option value={BEST}>{bestLabel}</option>
        <optgroup label="Providers">
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
              {states[s.id] ? ` (${stateLabel[states[s.id]!]})` : ""}
            </option>
          ))}
        </optgroup>
        <option value={NONE}>No lyrics</option>
      </select>
      <div className="lyrics-preview">
        {source === NONE ? (
          <p className="note">No lyrics are shown for this song.</p>
        ) : shown === undefined ? (
          <p className="note">Looking for lyrics…</p>
        ) : !shown ? (
          <p className="note">{source === BEST ? "None of the providers has this song." : "This provider hasn’t got this song. Pick another."}</p>
        ) : !shown.synced ? (
          <p className="note">These lyrics aren’t timed, so the radio doesn’t show them. Pick another provider.</p>
        ) : (
          <LyricsView key={`${song.key}|${source}|${shown.sourceId}`} ttml={shown.ttml} offsetMs={offsetMs} playhead={playhead} onLine={(sec) => preview.playFrom(key, sec)} />
        )}
      </div>
      <div className="help">Play the song above, or click a line to play from there. Move the lyrics if they come in early or late.</div>
      <div className="lyrics-offset">
        <button type="button" className="btn sm icon" aria-label="Lyrics 0.1 s earlier" disabled={offsetMs <= MIN_LYRICS_OFFSET_MS} onClick={() => step(-LYRICS_OFFSET_STEP_MS)}>
          <Minus className="ic-sm" />
        </button>
        <input
          type="range"
          className="range"
          min={MIN_LYRICS_OFFSET_MS}
          max={MAX_LYRICS_OFFSET_MS}
          step={LYRICS_OFFSET_STEP_MS}
          value={offsetMs}
          onChange={(e) => setOffsetMs(Number(e.target.value))}
          aria-label="Lyrics offset"
        />
        <button type="button" className="btn sm icon" aria-label="Lyrics 0.1 s later" disabled={offsetMs >= MAX_LYRICS_OFFSET_MS} onClick={() => step(LYRICS_OFFSET_STEP_MS)}>
          <Plus className="ic-sm" />
        </button>
        <span className="num off">{formatOffset(offsetMs)}</span>
        <button type="button" className="btn sm ghost icon" aria-label="Reset the offset" title="Reset" disabled={offsetMs === 0} onClick={() => setOffsetMs(0)}>
          <RotateCcw className="ic-sm" />
        </button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn strong sm" disabled={!changed || busy} onClick={save}>
          {busy ? "Saving…" : "Save lyrics"}
        </button>
        {changed && (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => {
              setSource(song.lyricsSource ?? BEST);
              setOffsetMs(song.lyricsOffsetMs ?? 0);
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
