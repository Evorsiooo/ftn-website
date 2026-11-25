-- Reads for a large song import (2,400 songs, Nov 2026). D1 counts every row a query reads and the
-- free plan allows 5M a day; these let the import, the schedule file and the lyrics list read only
-- the rows they need.

-- The downloader items an import has already recorded (JSON list of item numbers), so each check
-- only looks at songs finished since the last one.
ALTER TABLE `radio_imports` ADD `recorded_items` text;
--> statement-breakpoint
-- Duplicate check of a new song: same Spotify track, or a song within 5 seconds of its length.
CREATE INDEX IF NOT EXISTS `radio_songs_spotify_idx` ON `radio_songs` (`spotify_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `radio_songs_duration_idx` ON `radio_songs` (`duration_sec`);
--> statement-breakpoint
-- The Library page adds the songs changed since its last load instead of reloading them all.
CREATE INDEX IF NOT EXISTS `radio_songs_updated_idx` ON `radio_songs` (`updated_at`);
--> statement-breakpoint
-- The songs with a lyrics choice (GET /api/radio/lyrics-choices), without reading the others.
CREATE INDEX IF NOT EXISTS `radio_songs_lyrics_choice_idx` ON `radio_songs` (`r2_key`) WHERE lyrics_source IS NOT NULL OR lyrics_offset_ms <> 0;
--> statement-breakpoint
-- A change counter for playlist contents: radio/program.json re-reads a playlist show's songs only
-- when it moves, not every minute.
INSERT OR IGNORE INTO `radio_versions` (`name`, `version`) VALUES ('playlists', 0);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_playlist_songs_version_insert` AFTER INSERT ON `radio_playlist_songs` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'playlists';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_playlist_songs_version_update` AFTER UPDATE ON `radio_playlist_songs` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'playlists';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_playlist_songs_version_delete` AFTER DELETE ON `radio_playlist_songs` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'playlists';
END;
--> statement-breakpoint
-- A second counter for the library that moves only when a song stops being playable (archived, deleted,
-- or its file swapped): the public song list may then lag a few minutes behind new songs during an
-- import, but never offers a song that can't play.
INSERT OR IGNORE INTO `radio_versions` (`name`, `version`) VALUES ('songs_removed', 0);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_songs_removed_update` AFTER UPDATE OF `archived`, `r2_key` ON `radio_songs` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'songs_removed';
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `radio_songs_removed_delete` AFTER DELETE ON `radio_songs` BEGIN
  UPDATE `radio_versions` SET `version` = `version` + 1 WHERE `name` = 'songs_removed';
END;
