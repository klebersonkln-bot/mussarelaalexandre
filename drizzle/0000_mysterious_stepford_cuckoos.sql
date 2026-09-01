CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`summary` text NOT NULL,
	`details_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_created_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_date` text NOT NULL,
	`total_weight_grams` integer NOT NULL,
	`price_per_kg_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`notes` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `delivery_date_idx` ON `deliveries` (`delivery_date`);--> statement-breakpoint
CREATE TABLE `delivery_items` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_id` text NOT NULL,
	`weight_grams` integer NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `delivery_item_delivery_idx` ON `delivery_items` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_date` text NOT NULL,
	`method` text DEFAULT 'pix' NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_date_idx` ON `payments` (`payment_date`);--> statement-breakpoint
CREATE TABLE `price_history` (
	`id` text PRIMARY KEY NOT NULL,
	`effective_date` text NOT NULL,
	`price_cents` integer NOT NULL,
	`notes` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `price_effective_date_idx` ON `price_history` (`effective_date`);--> statement-breakpoint
CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'usuario' NOT NULL,
	`can_record_deliveries` integer DEFAULT true NOT NULL,
	`can_record_payments` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
