CREATE TABLE `editor_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` integer NOT NULL,
	`thread_id` integer NOT NULL,
	`draft_text` text,
	`task_text` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editor_conversations_chat_thread_unique` ON `editor_conversations` (`chat_id`,`thread_id`);