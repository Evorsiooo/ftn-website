DROP TABLE IF EXISTS `fixtures`;--> statement-breakpoint
DROP TABLE IF EXISTS `leagues`;--> statement-breakpoint
CREATE TABLE `sports_leagues` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`sport` text NOT NULL,
	`season` text NOT NULL,
	`color` text,
	`logo_url` text,
	`rules_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sports_leagues_slug_unique` ON `sports_leagues` (`slug`);--> statement-breakpoint
CREATE TABLE `sports_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	`color` text,
	`logo_url` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `sports_leagues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sports_drivers` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`team_id` text,
	`name` text NOT NULL,
	`number` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `sports_leagues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `sports_teams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sports_events` (
	`id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`name` text,
	`round` integer,
	`venue` text,
	`starts_at` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`home_team_id` text,
	`away_team_id` text,
	`home_score` integer,
	`away_score` integer,
	`overtime` integer DEFAULT false NOT NULL,
	`results_json` text,
	`video_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`league_id`) REFERENCES `sports_leagues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`home_team_id`) REFERENCES `sports_teams`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`away_team_id`) REFERENCES `sports_teams`(`id`) ON UPDATE no action ON DELETE set null
);
