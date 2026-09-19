CREATE TABLE `telegram_operations` (
	`key` text PRIMARY KEY NOT NULL,
	`method` text NOT NULL,
	`payload` text NOT NULL,
	`state` text NOT NULL,
	`result` text,
	`updated_at` integer NOT NULL,
	`not_before` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `telegram_operations_state_idx` ON `telegram_operations` (`state`);--> statement-breakpoint
ALTER TABLE `telegram_updates` ADD `state` text DEFAULT 'done' NOT NULL;--> statement-breakpoint
ALTER TABLE `telegram_updates` ADD `payload` text;--> statement-breakpoint
ALTER TABLE `telegram_updates` ADD `lease_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `telegram_updates` ADD `owner` text;--> statement-breakpoint
ALTER TABLE `telegram_updates` ADD `last_error` text;--> statement-breakpoint
CREATE INDEX `telegram_updates_state_idx` ON `telegram_updates` (`state`);--> statement-breakpoint
ALTER TABLE `sections` ADD `introduced` integer DEFAULT true NOT NULL;