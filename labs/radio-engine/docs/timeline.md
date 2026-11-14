# Radio timeline (v1)

Owner: Radio engine thread ("Prove synced playback and Automix"). Other
threads: message that thread to change this spec.

The listener's browser does everything. The server stores audio files (R2,
written by the downloader), one JSON timeline per programme, and answers a
clock endpoint. From those, every browser works out on its own which song is
playing, where in it, and how the mix into the next one sounds, and they all
agree because the arithmetic is the same everywhere.

Reference implementation: `labs/radio-engine/src/radio/` in ftn-website
(`timeline.ts`, `program.ts`, `planner.ts`, `engine.ts`).

## 1. Clock

`GET /api/radio/time?c=<clientMs>` answers `{ "clientMs": <echo>, "serverMs": <Date.now()> }`, `Cache-Control: no-store`.

The client is BitChord's Listen Together clock (`party/clock.ts`, ServerClock):

- local reading `performance.timeOrigin + performance.now()` (monotonic);
- a sample is `offset = serverMs - (sentAt + roundTrip / 2)`;
- keep the last 12 samples taken within 120 s; the one with the shortest
  round trip wins (its error is at most half that trip);
- ping 4 times 300 ms apart on start, then every 15 s (BitChord's
  `PING_INTERVAL_MS`). See "Costs" below for why the website may want 60 s.

`serverNow = localNow + offset`.

## 2. Timeline JSON

Stored by the website (R2 object or D1 row; the Library thread decides where)
and fetched by every listener. Written only when a programme is planned or
changed: never per listener.

```jsonc
{
  "version": 1,
  "id": "auto-show-123",
  "anchorMs": 1763078400000,   // server ms at which items[0] is at startSec
  "startSec": 0,
  "repeat": true,              // after the last item, start over (via mixes[n-1])
  "items": [
    {
      "key": "songs/youtube/dQw4w9WgXcQ.m4a",   // R2 key (download-api.md: audio.r2Key)
      "title": "...", "artist": "...",
      "durationSec": 213.04,                    // decoded duration
      "loudnessDb": -3.2                        // download-api.md Song.loudnessDb; null = no levelling
    }
  ],
  "mixes": [ /* mixes[i] joins items[i] to items[(i+1) % n]; n-1 of them when repeat is false */ ],
  "plannedWith": { "bars": 16, "analysisVersion": 8, "engine": "bitchord-automix@acf219a7" }
}
```

### Mix

```jsonc
{
  "style": "loop | blend | filter | crossfade",  // BitChord's TransitionPlan.style
  "outSec": 187.753463,   // outgoing song's position at the mix's start (t = 0)
  "settleSec": 31.283,    // from t = 0 until the incoming song plays alone at rate 1
  "inEndSec": 12.646821,  // incoming song's position at settleSec
  "handoffSec": 16.391,   // when "now playing" moves to the incoming song
  "reason": null,         // why it isn't beatmatched (BitChord's stats-for-nerds text)
  "loop": { /* BitChord's LoopMixPlan, display only */ },
  "program": { /* see 3 */ },
  "hash": "9ed5bb38"      // FNV-1a of JSON.stringify(program)
}
```

### Where everything is at a given server time

Songs are numbered globally: `k = cycle * n + i`. Song `k` plays on element
deck `k % 2` (A, B, A, ...), so two songs that overlap in a mix are always on
different decks.

- Mix out of song 0 starts at `T(0) = anchorMs + (mixes[0].outSec - startSec) * 1000`.
- `step(i) = mixes[i].settleSec + (mixes[i+1].outSec - mixes[i].inEndSec)`
  seconds from mix i's start to mix i+1's start (indices mod n).
- `T(k) = T(0) + 1000 * sum(step(j % n) for j < k)`; with repeat, whole
  cycles of `period = sum(step(i))` are skipped first.
- Song k (k > 0) is alone at rate 1 from `T(k-1) + settleSec` at position
  `inEndSec` (of mixes[k-1]), until `T(k)`, where it is at `outSec` of mixes[k].
- "On air" is song k from mix k-1's handoff to mix k's handoff.

Planning rule that keeps this valid: `mixes[i+1].outSec >= mixes[i].inEndSec`
(a song never mixes out before it has finished mixing in). The planner
guarantees it by planning each mix from the previous one's `inEndSec`.

## 3. Program: the mix as data

BitChord's Automix schedules a mix by calling Web Audio and its decks on the
live clock. The planner runs BitChord's own code (`scheduleTransition`,
`planLoopMix` + `scheduleLoopMix`, and the element handover from
`AutoDJ.scheduleLoop`) against stand-in decks that write each call down.
Times are seconds from the mix's start (negative = before it).

```jsonc
{
  "params": [   // in call order (cancelScheduledValues depends on it)
    { "deck": "outEl|inEl|outLoop|inLoop", "param": "gain|low|mid|high|hp|lp",
      "e": { "op": "set|lin|exp|target|cancel|curve", "v": 1, "at": -0.02, "tc": 0.02,
             "values": [/* curve */], "dur": 8.3 } }
  ],
  "transport": [ // element decks: AutoMix Timeline points
    { "deck": "outEl|inEl", "output": 0.06, "input": 187.81, "rate": 1, "active": false }
  ],
  "loops": [     // signalsmith-stretch loop decks: LoopChange
    { "deck": "outLoop|inLoop", "output": 0, "input": 187.75, "rate": 0.4208, "active": true, "loop": [187.75, 197.25] }
  ],
  "regions": [   // the stretch of each song the loop decks hold
    { "deck": "outLoop", "side": "out", "startSec": 136.45, "endSec": 201.45 }
  ]
}
```

Rest values on a fresh deck: gain 1 (element) or 0 (loop deck), EQ 0 dB,
high-pass 20 Hz, low-pass 20 kHz.

## 4. Listener

Every 250 ms:

1. `serverNow` from the clock. Map server ms to AudioContext time with
   `getOutputTimestamp()` (the sample at the speaker and its performance
   time, so output latency is included); median of the last 15 readings.
2. For songs k-1, k, k+1 that sound now or within 45 s: put deck `k % 2` on
   the song: `<audio src>` = the item's file, fader = loudness gain, and its
   transport (the incoming mix's `inEl` points, the outgoing mix's `outEl`
   points) via `Deck.follow()`; BitChord's servo holds the element there
   (rate nudges up to 3%, a seek past 250 ms). Automation: the recorded
   params replayed from now (an event in progress is picked up where it is).
3. A loop mix within 45 s: decode both songs, load the regions into
   BitChord's loop decks, and (once the clock mapping has settled) post the
   loop changes and params. A listener who arrives mid-mix starts each loop
   deck at the position it has reached.
4. When the mapping moves by 4 ms (clock offset improved, context clock
   drift), the element decks are re-put on the clock. A loop mix already
   under way is not moved (it would click).

Optional, BitChord's way: analyse the playing and next songs here
(IndexedDB-cached) and plan the mix again; equal hashes mean this browser
would have mixed it the same way.

## 5. Loudness

BitChord's phone: `gain = 10^(clamp(round(-loudnessDb * 100), -1500, 300) / 2000)`
(-15 dB to +3 dB), on each deck's fader (and each loop deck). `loudnessDb` is
YouTube's figure from the downloader; when it's null the planning browser
measures integrated loudness (EBU R128) and stores `LUFS + 14`.

## 6. Planning (who writes a timeline)

A browser: the Broadcast person's when they build an Auto show (or whoever
the website trusts to). It analyses each song with BitChord's analyzer,
measures loudness when needed, plans each mix in order and saves the
timeline. Analysis decodes at 44.1 kHz so every browser measures the same
samples.
