CREATE TABLE `containers` (
	`container_id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`tare_value` text NOT NULL,
	`tare_unit` text NOT NULL,
	`in_service` integer NOT NULL,
	`default_dyestuff_code` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `containers_default_dyestuff` ON `containers` (`default_dyestuff_code`) WHERE default_dyestuff_code is not null;