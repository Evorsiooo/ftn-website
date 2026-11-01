CREATE TABLE IF NOT EXISTS `song_votes` (
	`user_id` text NOT NULL,
	`song_key` text NOT NULL,
	`artist` text NOT NULL,
	`title` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `song_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `song_votes_song_idx` ON `song_votes` (`song_key`);
