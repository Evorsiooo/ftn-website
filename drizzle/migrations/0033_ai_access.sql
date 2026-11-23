-- AI access (MCP server at /mcp): the site's own OAuth server for AI apps, risky AI actions
-- waiting for the person's OK, and an audit log of admin actions (people and AI).
CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`redirect_uris` text NOT NULL,
	`secret_hash` text,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`resource` text NOT NULL,
	`scope` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_name` text NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`resource` text NOT NULL,
	`access_hash` text NOT NULL,
	`access_expires_at` integer NOT NULL,
	`refresh_hash` text NOT NULL,
	`previous_refresh_hash` text,
	`rotated_at` integer,
	`refresh_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_grants_access_idx` ON `oauth_grants` (`access_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_grants_refresh_idx` ON `oauth_grants` (`refresh_hash`);
--> statement-breakpoint
CREATE INDEX `oauth_grants_user_idx` ON `oauth_grants` (`user_id`);
--> statement-breakpoint
CREATE TABLE `ai_image_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`grant_id` text NOT NULL,
	`client_name` text NOT NULL,
	`folder` text NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`url` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_image_requests_user_idx` ON `ai_image_requests` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`user_id` text,
	`actor_label` text NOT NULL,
	`via` text NOT NULL,
	`action` text NOT NULL,
	`summary` text,
	`status` text NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`at`);
--> statement-breakpoint
CREATE INDEX `audit_log_user_idx` ON `audit_log` (`user_id`,`at`);
