PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_editor_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_chat_id` integer NOT NULL,
	`source_message_id` integer NOT NULL,
	`material_id` text,
	`thread_id` integer,
	`decision_text` text,
	`month_key` text NOT NULL,
	`request_text` text NOT NULL,
	`state` text NOT NULL,
	`reserved_cost_micros` integer NOT NULL,
	`charged_cost_micros` integer NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`response_text` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_editor_generations`("id", "source_chat_id", "source_message_id", "material_id", "thread_id", "decision_text", "month_key", "request_text", "state", "reserved_cost_micros", "charged_cost_micros", "input_tokens", "output_tokens", "response_text", "created_at", "updated_at") SELECT "id", "source_chat_id", "source_message_id", "material_id", "thread_id", "decision_text", "month_key", "request_text", "state", "reserved_cost_micros", "charged_cost_micros", "input_tokens", "output_tokens", "response_text", "created_at", "updated_at" FROM `editor_generations`;--> statement-breakpoint
DROP TABLE `editor_generations`;--> statement-breakpoint
ALTER TABLE `__new_editor_generations` RENAME TO `editor_generations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `editor_generations_source_message_unique` ON `editor_generations` (`source_chat_id`,`source_message_id`);--> statement-breakpoint
CREATE INDEX `editor_generations_history` ON `editor_generations` (`source_chat_id`,`thread_id`,`source_message_id`);--> statement-breakpoint
CREATE INDEX `editor_generations_month` ON `editor_generations` (`month_key`);--> statement-breakpoint
ALTER TABLE `editor_conversations` ADD `material_id` text;--> statement-breakpoint
ALTER TABLE `editor_conversations` ADD `rubric_key` text;--> statement-breakpoint
ALTER TABLE `editor_conversations` ADD `lock_token` text;--> statement-breakpoint
ALTER TABLE `editor_conversations` ADD `lock_until` integer DEFAULT 0 NOT NULL;