-- One-time broadcasts: a radio airing without a show carries its own host and logo
-- (title is already on the row). They are never listed under Shows & presenters.
ALTER TABLE `broadcasts` ADD `presenter` text;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `art_url` text;
