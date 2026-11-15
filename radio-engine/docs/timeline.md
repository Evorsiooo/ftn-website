# Radio timeline (v1)

Owner: Radio engine thread ("Prove synced playback and Automix"). Other
threads: message that thread to change this spec.

The listener's browser does everything. The VPS only downloads songs into
R2. The website stores the running order (one JSON timeline) and the shared
song analyses, checks every change listeners send, and answers a clock
endpoint. Most of the radio is a 24/7 AutoDJ run by whichever listeners are
on (section 6). From those, every browser works out on its own which song is
playing, where in it, and how the mix into the next one sounds, and they all
agree because the arithmetic is the same everywhere.

Reference implementation: `labs/radio-engine/src/radio/` in ftn-website
(`program.ts`, `planner.ts`, `autodj.ts`, `engine.ts`). The timeline format,
its arithmetic and the write checks are in `lib/radio/autodj.ts`, shared by
the website's endpoints and the browsers.

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

Stored by the website (the AutoDJ's in R2 at `test/autodj.json` for now)
and fetched by every listener (`GET /api/radio/autodj`, then every 10 s).
Written only when it needs another song: one write per song, not per
listener.

```jsonc
{
  "version": 1,
  "id": "autodj",
  "rev": 42,                   // +1 on every change; a write must build on the stored rev
  "firstK": 37,                // global number of items[0] (songs that are over get dropped)
  "anchorMs": 1763078400000,   // server ms at which items[0] is at startSec
  "startSec": 0,
  "repeat": false,             // the AutoDJ never repeats; a show may (via mixes[n-1])
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

Songs are numbered globally: `k = firstK + cycle * n + i`. When songs that
are over are dropped from the front (`rebase`), `firstK`, `anchorMs` and
`startSec` move with them so every k keeps its time. Song `k` plays on element
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

## 6. The 24/7 AutoDJ (who writes the timeline)

Nobody plans it ahead. The listeners who are on keep it going:

1. Every listener plays the stored running order (sections 2 to 4).
2. When fewer than 2 songs are lined up after the one on air, a listener
   (after a random 0 to 4 s wait and a fresh read) picks the next song from
   the library (no repeat within 3 songs), gets both songs' analyses, plans
   the mix with BitChord's Automix from the end of the last one (or 35 s
   from now, whichever is later) and sends the longer running order with
   `rev + 1`. Songs that are over are dropped from the front, keeping the
   one before the song on air for listeners mid-mix.
3. Analysis: `GET /api/radio/analysis/<song key>`. If nobody has shared it
   yet (404, or an older `analysisVersion`), the listener runs BitChord's
   analyzer in its own browser (cached in IndexedDB), then `PUT`s it. So
   each song is analysed once, by the first listener who needs it, not one
   browser going through the whole library.
4. Nobody listening: nothing runs and the running order simply ends. The
   first listener back finds it over (or missing) and sends a fresh start: one
   song from now + 1.5 s, preferring a song someone has already analysed,
   `firstK` past the old songs, `rev + 1`.
5. Several listeners at once: the website keeps the first valid write for a
   revision; the others get 409, read the new one and play it.

Analysis decodes at 44.1 kHz so every browser measures the same samples.
Shows (a host's planned programme) use the same format, written by the
host's browser, and are a later step.

## 7. Website endpoints and write checks

The VPS stays out of this: it only downloads songs into R2. The website
endpoints (edge, R2 binding `ftn_radio`) are the only writers.

| Endpoint | Does |
|---|---|
| `GET /api/radio/time?c=` | clock (section 1) |
| `GET /api/radio/file/<key>` | song and model bytes from R2, with Range |
| `GET /api/radio/autodj` | the running order, or 404 |
| `POST /api/radio/autodj` `{ timeline }` | stores a change if it passes `checkTimelineChange` |
| `GET`/`HEAD`/`PUT /api/radio/analysis/<song key>` | shared analyses; the first valid one stays |

Writes are anonymous (listeners aren't signed in), so the website trusts
nothing in them and checks everything against what it already has
(`lib/radio/autodj.ts`):

- **Running order** (`checkTimelineChange`): `rev` is exactly stored `rev + 1`
  (else 409). Every song is in the library, with its title, artist,
  duration and loudness as stored. A change only adds songs at the end and
  may drop songs that are over; everything already lined up (items, mixes,
  anchor) is identical, so nothing playing or about to play can be changed.
  Every new mix starts at least 20 s after the request, continues from the
  previous mix (`outSec >= inEndSec`), stays within the song lengths, and
  its program stays in safe bounds (gain 0 to 1, EQ -48 to +12 dB, filters
  10 Hz to 24 kHz, sane rates and loop lengths), with a hash that matches.
  At most 12 songs. A fresh start is only accepted when the stored order is
  over, starting within 60 s of the request.
- **First writer wins**: the store is conditional on the R2 etag read before
  the check (create-only when nothing is stored), so two listeners sending
  the same revision can't both win.
- **Analysis** (`checkAnalysis`): song in the library, current
  `analysisVersion`, duration matching the library's, numbers in range, at
  most 1.5 MB; once one is stored it is never replaced.

The worst a hostile listener can do is line up a valid but dull mix (a plain
crossfade) or a badly analysed song; they can't play anything outside the
library, change what is on air, or make it loud. If that ever matters,
listeners who re-plan a mix and get a different hash can flag it, and the
website can require sign-in for writes.
