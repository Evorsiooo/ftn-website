-- Genre tags (Adrien, 2026-11-25): a broad genre from Apple's catalogue (saved by the title check and by
-- "Find genres and original years"), detailed genres and the original release year from MusicBrainz.
-- Both lookups run in an admin's browser, only when a button is pressed. Playlists stay the "show" tag.
ALTER TABLE `radio_songs` ADD `genre` text;
--> statement-breakpoint
-- Detailed genres, most voted first: a JSON array of up to 5 names, e.g. ["disco","funk","soul"].
ALTER TABLE `radio_songs` ADD `genres` text;
--> statement-breakpoint
-- The year the song first came out (MusicBrainz), where release_year can be a reissue's.
ALTER TABLE `radio_songs` ADD `original_year` integer;
--> statement-breakpoint
-- When "Find genres and original years" last looked this song up (null: not yet).
ALTER TABLE `radio_songs` ADD `genre_checked_at` integer;
--> statement-breakpoint
-- Genres typed in by hand: the lookups never overwrite them.
ALTER TABLE `radio_songs` ADD `genre_by_hand` integer DEFAULT 0 NOT NULL;
