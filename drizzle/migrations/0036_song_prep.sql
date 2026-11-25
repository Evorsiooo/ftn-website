-- "Getting ready": a song goes on air (the AutoDJ may play it) once it has its mixing analysis and,
-- for a song added from a link, its title and cover checked in the music catalogue (Adrien, 2026-11-25).
-- Both run in an admin's browser when they press Prepare (or a broadcaster's, for songs they queue).
ALTER TABLE `radio_songs` ADD `analysed_at` integer;
--> statement-breakpoint
ALTER TABLE `radio_songs` ADD `meta_checked_at` integer;
--> statement-breakpoint
-- Why a song couldn't be prepared: 'missing' (its audio file isn't in the bucket) or 'failed'.
ALTER TABLE `radio_songs` ADD `prep_error` text;
--> statement-breakpoint
-- Every song already in the library has had its title check: only its analysis is left.
UPDATE `radio_songs` SET `meta_checked_at` = `created_at`;
--> statement-breakpoint
-- The songs still getting ready, without reading the ones on air.
CREATE INDEX IF NOT EXISTS `radio_songs_getting_ready_idx` ON `radio_songs` (`created_at`) WHERE analysed_at IS NULL OR meta_checked_at IS NULL;
--> statement-breakpoint
-- A new file (album-audio swap) needs a new analysis.
CREATE TRIGGER IF NOT EXISTS `radio_songs_new_file_unanalysed` AFTER UPDATE OF `r2_key` ON `radio_songs` WHEN NEW.`r2_key` IS NOT OLD.`r2_key` BEGIN
  UPDATE `radio_songs` SET `analysed_at` = NULL WHERE `id` = NEW.`id`;
END;
--> statement-breakpoint
-- Songs a Prepare run has reserved, so several PCs share the work. A reservation runs out on its own
-- (until, unix seconds) if that PC goes away.
CREATE TABLE IF NOT EXISTS `radio_prep_leases` (
  `song_id` text PRIMARY KEY NOT NULL REFERENCES `radio_songs`(`id`) ON DELETE CASCADE,
  `run_id` text NOT NULL,
  `until` integer NOT NULL
);
--> statement-breakpoint
-- One row per Prepare run, so its progress shows on every device (a phone too) and it can be stopped from there.
CREATE TABLE IF NOT EXISTS `radio_prep_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `user_name` text NOT NULL,
  `workers` integer NOT NULL,
  `total` integer NOT NULL,
  `done` integer DEFAULT 0 NOT NULL,
  `failed` integer DEFAULT 0 NOT NULL,
  `per_min` real,
  `stop_requested` integer DEFAULT 0 NOT NULL,
  `started_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `ended_at` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_prep_runs_ended_idx` ON `radio_prep_runs` (`ended_at`);
