CREATE TABLE `consumption_lines` (
	`posting_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`dyestuff_code` text NOT NULL,
	`lot_id` text,
	`actual_value` text NOT NULL,
	`actual_unit` text NOT NULL,
	`target_value` text NOT NULL,
	`target_unit` text NOT NULL,
	`result` text NOT NULL,
	PRIMARY KEY(`posting_id`, `sequence`),
	FOREIGN KEY (`posting_id`) REFERENCES `consumption_postings`(`posting_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dyestuff_code`) REFERENCES `dyestuffs`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`lot_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `consumption_postings` (
	`posting_id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`batch_id` text NOT NULL,
	`operator_id` text,
	`completed_at` text NOT NULL,
	`received_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`batch_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consumption_postings_idempotency_key` ON `consumption_postings` (`idempotency_key`);