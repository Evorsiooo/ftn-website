-- Statistics (admin Stats page). Small tables written by the every-5-minute stats cron and by
-- the endpoints that already count things; each keeps one row per minute slot, day or item.
CREATE TABLE IF NOT EXISTS `stat_listeners` (
	`at` integer PRIMARY KEY NOT NULL,
	`n` integer NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stat_listener_days` (
	`day` text NOT NULL,
	`id` text NOT NULL,
	`beats` integer NOT NULL DEFAULT 1,
	PRIMARY KEY(`day`, `id`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stat_song_plays` (
	`at` integer NOT NULL,
	`song_key` text NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`listeners` integer,
	PRIMARY KEY(`at`, `song_key`)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `stat_song_plays_key_idx` ON `stat_song_plays` (`song_key`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stat_watch_days` (
	`day` text NOT NULL,
	`youtube_id` text NOT NULL,
	`sessions` integer NOT NULL DEFAULT 0,
	`seconds` integer NOT NULL DEFAULT 0,
	`q25` integer NOT NULL DEFAULT 0,
	`q50` integer NOT NULL DEFAULT 0,
	`q75` integer NOT NULL DEFAULT 0,
	`q100` integer NOT NULL DEFAULT 0,
	PRIMARY KEY(`day`, `youtube_id`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stat_ad_days` (
	`day` text NOT NULL,
	`ad_id` text NOT NULL,
	`impressions` integer NOT NULL DEFAULT 0,
	`clicks` integer NOT NULL DEFAULT 0,
	PRIMARY KEY(`day`, `ad_id`)
);
