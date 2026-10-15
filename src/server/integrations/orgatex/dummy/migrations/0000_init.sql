CREATE TABLE `batches` (
	`batch_id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`queue_position` integer NOT NULL,
	`order_ref` text NOT NULL,
	`machine_ref` text NOT NULL,
	`fabric_desc` text NOT NULL,
	`fabric_weight_value` text NOT NULL,
	`fabric_weight_unit` text NOT NULL,
	`shade` text NOT NULL,
	`component_count` integer NOT NULL,
	`status` text NOT NULL,
	`recipe_id` text,
	`released_at` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dyestuffs` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ticket_short_name` text NOT NULL,
	`colour_hex` text NOT NULL,
	`type` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lots` (
	`lot_id` text PRIMARY KEY NOT NULL,
	`dyestuff_code` text NOT NULL,
	`training_only` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`dyestuff_code`) REFERENCES `dyestuffs`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipe_components` (
	`recipe_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`dyestuff_code` text NOT NULL,
	`target_value` text NOT NULL,
	`target_unit` text NOT NULL,
	`tolerance_value` text NOT NULL,
	`tolerance_unit` text NOT NULL,
	`bar_max_value` text NOT NULL,
	`bar_max_unit` text NOT NULL,
	`suggested_lot` text,
	PRIMARY KEY(`recipe_id`, `sequence`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`recipe_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dyestuff_code`) REFERENCES `dyestuffs`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`suggested_lot`) REFERENCES `lots`(`lot_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`recipe_id` text PRIMARY KEY NOT NULL,
	`shade` text NOT NULL,
	`version` text NOT NULL
);
