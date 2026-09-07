CREATE TABLE `assessment_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_id` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`submitted_at` integer NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_id` integer NOT NULL,
	`request_id` integer NOT NULL,
	`reputation_score` integer NOT NULL,
	`risk_level` text NOT NULL,
	`credit_limit_usd_minor` integer NOT NULL,
	`apr_bps` integer NOT NULL,
	`collateral_bps` integer NOT NULL,
	`reviewer_notes` text DEFAULT '' NOT NULL,
	`onchain_tx_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`request_id`) REFERENCES `assessment_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `attestations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_id` integer NOT NULL,
	`chain_id` integer NOT NULL,
	`source_tx_hash` text,
	`event_type` text NOT NULL,
	`proof_status` text DEFAULT 'PENDING' NOT NULL,
	`onchain_tx_hash` text,
	`verified_at` integer,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `wallet_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wallet_id` integer NOT NULL,
	`eth_balance` text,
	`stablecoin_balance` text,
	`transaction_count` integer,
	`active_days` integer,
	`total_borrowed` text,
	`total_repaid` text,
	`outstanding_debt` text,
	`borrow_count` integer,
	`repayment_count` integer,
	`liquidation_count` integer,
	`liquidated_amount` text,
	`largest_loan` text,
	`average_loan_size` text,
	`current_collateral` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_metrics_wallet_id_unique` ON `wallet_metrics` (`wallet_id`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text NOT NULL,
	`wallet_type` text NOT NULL,
	`first_seen` integer,
	`last_active` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallets_address_unique` ON `wallets` (`address`);