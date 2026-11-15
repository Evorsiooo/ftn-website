-- Radio song library (BitChord-based webradio). Songs are files in the ftn-radio R2 bucket that the
-- VPS downloader (euno-radio) or an upload put there; the AutoDJ plays every song not archived.
CREATE TABLE IF NOT EXISTS `radio_songs` (
	`id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`meta_key` text,
	`source` text NOT NULL,
	`source_id` text,
	`source_url` text,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`album` text,
	`release_year` integer,
	`duration_sec` real NOT NULL,
	`loudness_db` real,
	`thumbnail_url` text,
	`spotify_id` text,
	`bytes` integer,
	`content_type` text,
	`archived` integer DEFAULT 0 NOT NULL,
	`added_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `radio_songs_r2_key_idx` ON `radio_songs` (`r2_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_songs_archived_idx` ON `radio_songs` (`archived`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radio_playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`source_url` text,
	`source` text,
	`last_synced_at` integer,
	`created_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radio_playlist_songs` (
	`playlist_id` text NOT NULL REFERENCES `radio_playlists`(`id`) ON DELETE CASCADE,
	`song_id` text NOT NULL REFERENCES `radio_songs`(`id`) ON DELETE CASCADE,
	`position` integer NOT NULL,
	PRIMARY KEY(`playlist_id`, `song_id`)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_playlist_songs_order_idx` ON `radio_playlist_songs` (`playlist_id`, `position`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radio_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`playlist_id` text REFERENCES `radio_playlists`(`id`) ON DELETE SET NULL,
	`position` integer,
	`state` text NOT NULL,
	`title` text,
	`total` integer,
	`done` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`review` text,
	`error` text,
	`created_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_imports_state_idx` ON `radio_imports` (`state`);
--> statement-breakpoint
-- Radio listener count (the player thread): each listener upserts its random id about every
-- 10 minutes; the count is rows seen in the last 11 minutes.
CREATE TABLE IF NOT EXISTS `radio_listeners` (
	`id` text PRIMARY KEY NOT NULL,
	`seen_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_listeners_seen_idx` ON `radio_listeners` (`seen_at`);
