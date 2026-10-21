CREATE TABLE `organizers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`logo_url` text,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizers_name_unique` ON `organizers` (`name`);--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `organizer_id` text REFERENCES organizers(id);--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `message_link` text;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `post_impressions_purchased` integer;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `post_impressions_used` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `ad_format` text DEFAULT '1024x180' NOT NULL;--> statement-breakpoint
INSERT INTO `organizers` (`id`, `name`, `created_at`) SELECT lower(hex(randomblob(16))), `advertiser_name`, CAST(strftime('%s', 'now') AS integer) FROM (SELECT DISTINCT `advertiser_name` FROM `ad_campaigns`);--> statement-breakpoint
UPDATE `ad_campaigns` SET `organizer_id` = (SELECT `id` FROM `organizers` WHERE `organizers`.`name` = `ad_campaigns`.`advertiser_name`);
