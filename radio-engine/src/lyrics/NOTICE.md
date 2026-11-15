# Lyrics

Ported from BitChord (https://github.com/evorsiooo/bitchord, `web/app/src/lyrics` and
`web/app/src/data/apple/webToken.ts` at acf219a7), GPL-3.0, combined with the AGPL engine as allowed by GPLv3 §13.

Changes for the FTN radio: requests BitChord sends through its browser extension go through the website's
`/api/radio/lyrics` proxy (`http.ts` rewritten); Genius, the two YouTube sources and the keyed PaxSenix routes are
left out (`sources.ts`, `providers.ts`, `repository.ts`), and the user settings are BitChord's defaults.
`model.ts`, `parse.ts`, `ttml.ts` are unchanged.
