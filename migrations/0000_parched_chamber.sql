CREATE TABLE `telegram_updates` (
	`update_id` integer PRIMARY KEY NOT NULL,
	`received_at` integer NOT NULL,
	`state` text DEFAULT 'done' NOT NULL,
	`payload` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`owner` text,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `telegram_updates_state_idx` ON `telegram_updates` (`state`);--> statement-breakpoint
CREATE TABLE `sections` (
	`key` text PRIMARY KEY NOT NULL,
	`thread_id` integer NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`introduced` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sections_thread_id_unique` ON `sections` (`thread_id`);--> statement-breakpoint
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
CREATE INDEX `telegram_operations_state_idx` ON `telegram_operations` (`state`);