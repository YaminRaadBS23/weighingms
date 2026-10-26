ALTER TABLE `weighing_records` ADD `override_supervisor_id` text REFERENCES operators(operator_id);--> statement-breakpoint
ALTER TABLE `weighing_records` ADD `override_reason` text;--> statement-breakpoint
ALTER TABLE `weighing_records` ADD `override_zone` text;--> statement-breakpoint
ALTER TABLE `weighing_records` ADD `override_at` text;