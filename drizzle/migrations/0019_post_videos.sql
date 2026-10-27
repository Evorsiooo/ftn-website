ALTER TABLE `posts` ADD `media_type` text DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `video_url` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `video_edit` text;
