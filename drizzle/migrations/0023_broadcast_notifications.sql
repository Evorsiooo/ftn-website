ALTER TABLE `broadcasts` ADD `notify` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `notify_message` text;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `notify_ro_states` text;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `last_notified_at` integer;
