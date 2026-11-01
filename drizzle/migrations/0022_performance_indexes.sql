CREATE INDEX IF NOT EXISTS `articles_status_published_idx` ON `articles` (`status`,`published_at`);
CREATE INDEX IF NOT EXISTS `videos_published_idx` ON `videos` (`published_at`);
CREATE INDEX IF NOT EXISTS `videos_is_live_idx` ON `videos` (`is_live`);
CREATE INDEX IF NOT EXISTS `comments_article_idx` ON `comments` (`article_id`,`created_at`);
CREATE INDEX IF NOT EXISTS `video_views_viewed_idx` ON `video_views` (`viewed_at`,`video_id`);
