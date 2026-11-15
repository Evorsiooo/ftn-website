# Radio engine lab

A standalone test page for the FTN+ radio rebuild. It proves that every
listener's browser can play the same song at the same moment, mixed by
BitChord's Automix, from nothing but audio files and a timeline on R2 and a
clock endpoint on the website. It is not linked from the site.

- Page: `/labs/radio-engine/` (built into `public/labs/radio-engine/`).
- Planner: `/labs/radio-engine/?mode=plan` analyses the songs and plans the
  mixes, as the browser that builds an Auto show would.
- Spec: `docs/timeline.md` (the same file as
  `plans/radio/timeline.md` in the project folder).

## What comes from BitChord

`src/bitchord/` is copied from Evorsiooo/BitChord at `acf219a7`
(`web/app/src/party/clock.ts` and `web/app/src/playback/automix/`):

- `party/clock.ts`: Listen Together's ServerClock, verbatim.
- `automix/analysis/*`: the analyzer, worker, essentia.js, Beat This! and
  open-unmix front ends. Changed: the audio comes from the radio bucket
  instead of YouTube (`src/radio/fetchAudio.ts`), the models and the
  onnxruntime `.wasm` are read from the bucket's `models/` folder, the track
  log is the console, the IndexedDB is named `ftn-radio-automix`.
- `automix/engine/*`: deck, loop deck, loop mix, transition scheduler, grid,
  EQ, timeline. Changed: `Deck.follow()` added (puts a deck on a timeline
  worked out from the server clock). `autodj.ts` and `selector.ts` are not
  used: the timeline decides what plays next.

`src/radio/` is the lab's own code: the timeline arithmetic, the planner that
runs BitChord's scheduling code against recording stand-ins, the replay of
that recording, loudness, and the listener.

## Running it locally

```sh
npm install
npm run build          # type-check, then build into ../../public/labs/radio-engine
BUCKET_DIR=<folder mirroring the ftn-radio bucket> npm run serve
```

`tools/lab-server.mjs` serves the page, `/api/radio/time` (with optional
`JITTER_MS` network jitter) and `/api/radio/file/<key>` from the folder.
`tools/plan.mjs` plans a timeline in headless Chromium and
`tools/sync-test.mjs` runs the two-listener drift test.

Page options (query string): `skew=<ms>` puts this device's clock off on
purpose, `analyse=0` skips the listener-side analysis check,
`anchorMs=<ms>` moves the timeline (tests), `timeline=<key>`, `autostart=1`.

## Licences

The Automix files are AGPL-3.0 (`src/bitchord/automix/LICENSE`,
`NOTICE.md`); BitChord is GPL-3.0; the lab is AGPL-3.0. The analysis models
are Beat This! (MIT weights) and open-unmix, as shipped in BitChord.

Test music: Kevin MacLeod (incompetech.com), "Funkorama", "Disco con Tutti",
"Groove Grove", "Hustle", "Pixelland". Licensed under Creative Commons:
By Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/).
