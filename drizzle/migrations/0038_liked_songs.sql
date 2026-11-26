-- Liked songs on FTN+ Saved. A like (song_votes value 1) is kept by the listener's browser id; signed-in
-- listeners' likes also carry their account, so their Liked songs are the same on every device.
ALTER TABLE `song_votes` ADD `user_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `song_votes_user_idx` ON `song_votes` (`user_id`);
