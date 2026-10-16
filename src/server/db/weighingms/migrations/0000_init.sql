CREATE TABLE `audit_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`type` text NOT NULL,
	`actor_id` text NOT NULL,
	`detail` text NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `weighing_sessions`(`session_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `operators`(`operator_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_events_session` ON `audit_events` (`session_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `component_weighings` (
	`session_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`state` text NOT NULL,
	`activated_at` text,
	PRIMARY KEY(`session_id`, `sequence`),
	FOREIGN KEY (`session_id`) REFERENCES `weighing_sessions`(`session_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `operators` (
	`operator_id` text PRIMARY KEY NOT NULL,
	`badge_id` text NOT NULL,
	`name` text NOT NULL,
	`shift` text NOT NULL,
	`role` text NOT NULL,
	`active` integer NOT NULL,
	`pin_hash` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operators_badge_id_unique` ON `operators` (`badge_id`);--> statement-breakpoint
CREATE TABLE `station_state` (
	`station_id` text PRIMARY KEY NOT NULL,
	`current_operator_id` text,
	`signed_in_at` text,
	FOREIGN KEY (`current_operator_id`) REFERENCES `operators`(`operator_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `weighing_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`station_id` text NOT NULL,
	`started_by` text NOT NULL,
	`status` text NOT NULL,
	`recipe_snapshot` text NOT NULL,
	`orgatex_status_sync` text NOT NULL,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`started_by`) REFERENCES `operators`(`operator_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_open_session_per_batch` ON `weighing_sessions` (`batch_id`) WHERE status in ('IN_PROGRESS', 'SUSPENDED');--> statement-breakpoint
CREATE INDEX `weighing_sessions_station_status` ON `weighing_sessions` (`station_id`,`status`);