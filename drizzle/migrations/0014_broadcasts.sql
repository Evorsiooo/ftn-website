CREATE TABLE `broadcasts` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text,
	`title` text,
	`description` text,
	`on_radio` integer DEFAULT true NOT NULL,
	`on_stream` integer DEFAULT false NOT NULL,
	`kind` text DEFAULT 'weekly' NOT NULL,
	`tag` text DEFAULT 'live' NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`day_of_week` integer,
	`start_minute` integer,
	`duration_minutes` integer,
	`starts_at` integer,
	`ends_at` integer,
	`youtube_id` text,
	`sports_event_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `radio_shows`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `broadcasts` (`id`, `show_id`, `on_radio`, `on_stream`, `kind`, `tag`, `status`, `day_of_week`, `start_minute`, `duration_minutes`, `starts_at`, `ends_at`, `created_at`, `updated_at`)
SELECT `id`, `show_id`, 1, 0, `kind`, `tag`, 'scheduled', `day_of_week`, `start_minute`, `duration_minutes`, `starts_at`, `ends_at`, `created_at`, `created_at` FROM `radio_slots`;
--> statement-breakpoint
DROP TABLE `radio_slots`;
