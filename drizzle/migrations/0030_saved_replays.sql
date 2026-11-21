-- Radio replays saved for later (FTN+ Saved), like videos in watchlists. Kept apart from
-- watchlists because those rows must point at a video.
CREATE TABLE `radio_replay_saves` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`replay_id` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `replay_id`)
);
