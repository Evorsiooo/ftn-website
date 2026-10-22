ALTER TABLE `sports_leagues` ADD `scoring` text DEFAULT 'points' NOT NULL;--> statement-breakpoint
ALTER TABLE `sports_leagues` ADD `constructors` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `sports_leagues` ADD `banner_url` text;--> statement-breakpoint
CREATE TABLE `sports_venues` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`photo_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sports_events` ADD `venue_id` text REFERENCES sports_venues(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `sports_events` ADD `article_id` text REFERENCES articles(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `sports_drivers` ADD `roblox_username` text;
