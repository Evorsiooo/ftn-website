CREATE TABLE IF NOT EXISTS `radio_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`song_key` text,
	`song_title` text,
	`song_artist` text,
	`details` text DEFAULT '' NOT NULL,
	`diagnostics` text,
	`source` text NOT NULL,
	`user_id` text,
	`username` text,
	`sender_hash` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_reports_status_idx` ON `radio_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_reports_created_idx` ON `radio_reports` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_reports_sender_idx` ON `radio_reports` (`sender_hash`,`song_key`,`reason`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radio_report_blocks` (
	`key` text PRIMARY KEY NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL
);
