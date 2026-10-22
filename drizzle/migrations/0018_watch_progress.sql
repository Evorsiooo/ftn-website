CREATE TABLE `watch_progress` (
	`user_id` text NOT NULL,
	`youtube_id` text NOT NULL,
	`position_seconds` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `youtube_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `watch_progress_user_updated_idx` ON `watch_progress` (`user_id`,`updated_at`);
