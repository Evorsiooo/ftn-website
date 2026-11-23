-- D1 counts every row a query reads, and the free plan allows 5M a day. These columns were searched
-- without an index, so each lookup read the whole table (22 Nov 2026 audit,
-- plans/d1-reads-audit/audit-2026-11-22.md).
CREATE INDEX IF NOT EXISTS `videos_channel_idx` ON `videos` (`channel_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_roles_user_idx` ON `user_roles` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tips_created_idx` ON `tips` (`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tips_status_idx` ON `tips` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `posts_scheduled_idx` ON `posts` (`scheduled_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `posts_status_idx` ON `posts` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_imports_created_idx` ON `radio_imports` (`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_imports_review_idx` ON `radio_imports` (`id`) WHERE review LIKE '%"open":[{%';
--> statement-breakpoint
-- Playlist song counts, kept by triggers so listing playlists doesn't count every playlist song.
ALTER TABLE `radio_playlists` ADD `song_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `radio_playlists` SET `song_count` = (SELECT count(*) FROM `radio_playlist_songs` WHERE `playlist_id` = `radio_playlists`.`id`);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_playlist_songs_count_add` AFTER INSERT ON `radio_playlist_songs` BEGIN
  UPDATE `radio_playlists` SET `song_count` = `song_count` + 1 WHERE `id` = NEW.`playlist_id`;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_playlist_songs_count_remove` AFTER DELETE ON `radio_playlist_songs` BEGIN
  UPDATE `radio_playlists` SET `song_count` = `song_count` - 1 WHERE `id` = OLD.`playlist_id`;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_playlist_songs_count_move` AFTER UPDATE OF `playlist_id` ON `radio_playlist_songs` WHEN NEW.`playlist_id` IS NOT OLD.`playlist_id` BEGIN
  UPDATE `radio_playlists` SET `song_count` = `song_count` - 1 WHERE `id` = OLD.`playlist_id`;
  UPDATE `radio_playlists` SET `song_count` = `song_count` + 1 WHERE `id` = NEW.`playlist_id`;
END;
--> statement-breakpoint
-- A change counter for the song library, so "has the library changed?" reads one row, not every song.
CREATE TABLE IF NOT EXISTS `radio_versions` (
  `name` text PRIMARY KEY NOT NULL,
  `version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `radio_versions` (`name`, `version`) VALUES ('songs', 0);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_songs_version_insert` AFTER INSERT ON `radio_songs` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'songs';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_songs_version_update` AFTER UPDATE ON `radio_songs` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'songs';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_songs_version_delete` AFTER DELETE ON `radio_songs` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'songs';
END;
--> statement-breakpoint
-- The same for the schedule (radio_shows and broadcasts).
INSERT OR IGNORE INTO `radio_versions` (`name`, `version`) VALUES ('schedule', 0);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_shows_version_insert` AFTER INSERT ON `radio_shows` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'schedule';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_shows_version_update` AFTER UPDATE ON `radio_shows` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'schedule';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_shows_version_delete` AFTER DELETE ON `radio_shows` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'schedule';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `broadcasts_version_insert` AFTER INSERT ON `broadcasts` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'schedule';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `broadcasts_version_update` AFTER UPDATE ON `broadcasts` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'schedule';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `broadcasts_version_delete` AFTER DELETE ON `broadcasts` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'schedule';
END;
