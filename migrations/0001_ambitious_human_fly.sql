CREATE TABLE `editor_material_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`material_id` text NOT NULL,
	`number` integer NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editor_material_versions_number_unique` ON `editor_material_versions` (`material_id`,`number`);--> statement-breakpoint
CREATE TABLE `editor_materials` (
	`id` text PRIMARY KEY NOT NULL,
	`source_chat_id` integer NOT NULL,
	`source_message_id` integer NOT NULL,
	`thread_id` integer NOT NULL,
	`rubric_key` text,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editor_materials_source_message_unique` ON `editor_materials` (`source_chat_id`,`source_message_id`);--> statement-breakpoint
CREATE TABLE `editor_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`source_chat_id` integer NOT NULL,
	`source_message_id` integer NOT NULL,
	`scope` text NOT NULL,
	`rubric_key` text,
	`value` text NOT NULL,
	`source_material_id` text,
	`created_at` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editor_memory_source_message_unique` ON `editor_memory` (`source_chat_id`,`source_message_id`);--> statement-breakpoint
CREATE TABLE `editor_rubrics` (
	`key` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`instructions` text NOT NULL,
	`created_at` integer NOT NULL
);
