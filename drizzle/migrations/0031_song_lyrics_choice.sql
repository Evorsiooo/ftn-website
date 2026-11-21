-- Radio lyrics, per song, set in the admin and used by every listener: which provider's lyrics to show
-- (NULL = BitChord's best available, a provider id from radio-engine/src/lyrics/sources.ts, or 'none' to show
-- no lyrics), and how far to move them (ms, -5000 to +5000; positive = later, as BitChord's lyrics offset).
ALTER TABLE `radio_songs` ADD `lyrics_source` text;
ALTER TABLE `radio_songs` ADD `lyrics_offset_ms` integer DEFAULT 0 NOT NULL;
