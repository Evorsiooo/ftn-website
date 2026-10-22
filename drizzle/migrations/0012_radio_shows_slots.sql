DROP TABLE `radio_shows`;--> statement-breakpoint
CREATE TABLE `radio_shows` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`presenter` text NOT NULL,
	`description` text,
	`art_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `radio_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`kind` text DEFAULT 'weekly' NOT NULL,
	`tag` text DEFAULT 'live' NOT NULL,
	`day_of_week` integer,
	`start_minute` integer,
	`duration_minutes` integer,
	`starts_at` integer,
	`ends_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `radio_shows`(`id`) ON UPDATE no action ON DELETE cascade
);
