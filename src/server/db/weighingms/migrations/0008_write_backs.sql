CREATE TABLE `write_backs` (
	`batch_id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_error_message` text,
	`posting_id` text,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `weighing_sessions`(`session_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `write_backs_idempotency_key_unique` ON `write_backs` (`idempotency_key`);