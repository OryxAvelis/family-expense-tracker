CREATE TABLE `family_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `family_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_family_sessions_user_id` ON `family_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_family_sessions_expires_at` ON `family_sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `family_users` ADD `password_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
PRAGMA optimize;
