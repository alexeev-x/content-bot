CREATE TABLE `editor_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_chat_id` integer NOT NULL,
	`source_message_id` integer NOT NULL,
	`material_id` text NOT NULL,
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
CREATE UNIQUE INDEX `editor_generations_source_message_unique` ON `editor_generations` (`source_chat_id`,`source_message_id`);