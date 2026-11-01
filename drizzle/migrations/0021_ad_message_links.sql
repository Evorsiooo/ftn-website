ALTER TABLE `ad_campaigns` ADD `message_links` text;--> statement-breakpoint
UPDATE `ad_campaigns` SET `message_links` = json_object('harrison', `message_link`, 'ridgeway', `message_link`, 'madison', `message_link`, 'clark', `message_link`, 'firestone', `message_link`, 'international', `message_link`) WHERE `message_link` IS NOT NULL AND `message_link` <> '';
