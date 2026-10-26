CREATE TABLE `tickets` (
	`ticket_id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`session_id` text NOT NULL,
	`is_reprint` integer NOT NULL,
	`reprint_of` text,
	`content` text NOT NULL,
	`barcode_value` text NOT NULL,
	`print_status` text NOT NULL,
	`print_attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_error_state` text,
	`last_error_message` text,
	`job_id` text,
	`printed_at` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `weighing_sessions`(`session_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reprint_of`) REFERENCES `tickets`(`ticket_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `operators`(`operator_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_original_per_batch` ON `tickets` (`batch_id`) WHERE is_reprint = 0;--> statement-breakpoint
CREATE INDEX `tickets_batch_created` ON `tickets` (`batch_id`,`created_at`);