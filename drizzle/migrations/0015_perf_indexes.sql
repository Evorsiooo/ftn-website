-- Performance indexes. Hand-written (not drizzle-generated) and idempotent; do not apply until approved.
CREATE INDEX IF NOT EXISTS `idx_video_views_viewed_at_video` ON `video_views` (`viewed_at`, `video_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_videos_published_at` ON `videos` (`published_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_articles_status_published` ON `articles` (`status`, `published_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comments_article_status` ON `comments` (`article_id`, `status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_watchlists_user` ON `watchlists` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_user_moderation_user` ON `user_moderation` (`user_id`);
