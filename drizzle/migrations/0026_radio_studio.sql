-- Radio wave 3: what a scheduled airing plays, the Studio (hosted shows with co-broadcasters and
-- callers), the Realtime voice usage meter, and replays.
ALTER TABLE `broadcasts` ADD `plays` text DEFAULT 'hosted' NOT NULL;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `playlist_id` text REFERENCES `radio_playlists`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `stream_url` text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radio_studio_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`show_id` text REFERENCES `radio_shows`(`id`) ON DELETE SET NULL,
	`state` text DEFAULT 'live' NOT NULL,
	`call_in` integer DEFAULT 0 NOT NULL,
	`paused_at` integer,
	`paused_key` text,
	`paused_sec` real,
	`replay_id` text,
	`started_by` text REFERENCES `users`(`id`) ON DELETE SET NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_studio_sessions_state_idx` ON `radio_studio_sessions` (`state`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radio_studio_people` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL REFERENCES `radio_studio_sessions`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`avatar` text,
	`role` text NOT NULL,
	`state` text NOT NULL,
	`rtc_session` text,
	`track` text,
	`joined_at` integer NOT NULL,
	`seen_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_studio_people_session_idx` ON `radio_studio_people` (`session_id`, `state`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radio_studio_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL REFERENCES `radio_studio_sessions`(`id`) ON DELETE CASCADE,
	`song_key` text,
	`import_id` text,
	`label` text NOT NULL,
	`position` real NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`added_by` text,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_studio_queue_session_idx` ON `radio_studio_queue` (`session_id`, `state`, `position`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radio_rtc_usage` (
	`month` text PRIMARY KEY NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radio_replays` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`airing_key` text,
	`title` text NOT NULL,
	`show_id` text REFERENCES `radio_shows`(`id`) ON DELETE SET NULL,
	`art_url` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`hidden` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `radio_replays_airing_idx` ON `radio_replays` (`airing_key`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_replays_started_idx` ON `radio_replays` (`started_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radio_replay_parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`replay_id` text NOT NULL REFERENCES `radio_replays`(`id`) ON DELETE CASCADE,
	`kind` text NOT NULL,
	`r2_key` text,
	`start_ms` integer NOT NULL,
	`end_ms` integer,
	`user_id` text
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_replay_parts_replay_idx` ON `radio_replay_parts` (`replay_id`, `start_ms`);
