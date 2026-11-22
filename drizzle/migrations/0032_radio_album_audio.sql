-- BitChord's album-audio swap (euno-radio resolveAudio): each song's music-video flag (Automix's
-- loop mixes skip music videos), where its names came from, and what the album-audio check found.
-- audio_check: NULL not checked yet, 'album' the file is the catalogue song, 'swapped' replaced by
-- the album version, 'unmatched' a music video with no album version (kept), 'failed' YouTube
-- Music didn't answer (asked again later), 'duplicate' its album version was already in the library.
ALTER TABLE `radio_songs` ADD `music_video` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `radio_songs` ADD `metadata_source` text;
--> statement-breakpoint
ALTER TABLE `radio_songs` ADD `audio_check` text;
--> statement-breakpoint
ALTER TABLE `radio_songs` ADD `audio_checked_at` integer;
--> statement-breakpoint
ALTER TABLE `radio_songs` ADD `audio_check_note` text;
--> statement-breakpoint
-- The library title and artist the check last searched with (title, newline, artist): an unmatched
-- song is checked again once its names in the library change.
ALTER TABLE `radio_songs` ADD `audio_check_names` text;
--> statement-breakpoint
CREATE INDEX `radio_songs_audio_check_idx` ON `radio_songs` (`audio_check`);
--> statement-breakpoint
-- One row per re-check batch sent to the downloader (id = its job id). applied: item indexes already
-- written to the library. old_keys: replaced files still to delete (kept while a running order or a
-- replay uses them).
CREATE TABLE `radio_audio_rechecks` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`songs` text NOT NULL,
	`applied` text,
	`old_keys` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
