ALTER TABLE `products` ADD `external_source` text;--> statement-breakpoint
ALTER TABLE `products` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_external_source_id` ON `products` (`external_source`,`external_id`);--> statement-breakpoint
PRAGMA optimize;
