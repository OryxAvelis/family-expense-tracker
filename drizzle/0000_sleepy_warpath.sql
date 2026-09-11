CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cart_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cart_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity_hundredths` integer NOT NULL,
	`requested_unit_price_cents` integer NOT NULL,
	`actual_unit_price_cents` integer NOT NULL,
	`purchase_status` text DEFAULT 'requested' NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_cart_items_cart_id` ON `cart_items` (`cart_id`);--> statement-breakpoint
CREATE INDEX `idx_cart_items_product_id` ON `cart_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `carts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`approved_at` text,
	`completed_at` text,
	FOREIGN KEY (`member_id`) REFERENCES `family_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_carts_member_status` ON `carts` (`member_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_carts_queue` ON `carts` (`status`,`priority`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_carts_completed_at` ON `carts` (`completed_at`);--> statement-breakpoint
CREATE TABLE `family_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`role` text NOT NULL,
	`initials` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_family_users_username` ON `family_users` (`username`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_fr` text NOT NULL,
	`name_ar` text DEFAULT '' NOT NULL,
	`name_en` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`unit` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`image_position` text DEFAULT '0% 0%' NOT NULL,
	`purchase_count` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_name_fr` ON `products` (`name_fr`);--> statement-breakpoint
CREATE INDEX `idx_products_category_active` ON `products` (`category`,`active`);--> statement-breakpoint
PRAGMA optimize;
