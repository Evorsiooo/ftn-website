CREATE TABLE `site_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `video_views` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`viewed_at` integer NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `articles` ADD `opinion_role` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `opinion_quote` text;