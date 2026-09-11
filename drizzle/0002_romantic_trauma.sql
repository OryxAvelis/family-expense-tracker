DROP INDEX `idx_products_name_fr`;--> statement-breakpoint
ALTER TABLE `products` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `products` ADD `barcode` text;--> statement-breakpoint
ALTER TABLE `products` ADD `package_size` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_barcode` ON `products` (`barcode`);--> statement-breakpoint
CREATE INDEX `idx_products_name_fr` ON `products` (`name_fr`);--> statement-breakpoint
PRAGMA optimize;
