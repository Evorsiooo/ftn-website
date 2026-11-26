-- Broadcasters' collections (Adrien, 2026-11-25): songs a broadcaster adds always go into their own
-- collection, which they queue from in the Studio; only the ones they tick "Also add to the AutoDJ" for are
-- played by the AutoDJ. Collections are private to their owner (site admins see all of them).
ALTER TABLE `radio_songs` ADD `autodj` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `radio_imports` ADD `collection_of` text;
--> statement-breakpoint
ALTER TABLE `radio_imports` ADD `autodj` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- A playlist imported into someone's collection: the Studio groups that collection's songs by it.
ALTER TABLE `radio_playlists` ADD `collection_of` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_playlists_collection_idx` ON `radio_playlists` (`collection_of`) WHERE collection_of IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radio_collection_songs` (
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `song_id` text NOT NULL REFERENCES `radio_songs`(`id`) ON DELETE CASCADE,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`user_id`, `song_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_collection_songs_song_idx` ON `radio_collection_songs` (`song_id`);
--> statement-breakpoint
-- Taking a song off the AutoDJ stops it being picked at once (the public song list is rebuilt, as for an archive).
CREATE TRIGGER IF NOT EXISTS `radio_songs_autodj_update` AFTER UPDATE OF `autodj` ON `radio_songs` WHEN NEW.`autodj` IS NOT OLD.`autodj` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'songs_removed';
END;
