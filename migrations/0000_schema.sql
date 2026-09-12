CREATE TABLE `avatar_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`file_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text DEFAULT 'image/webp' NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`expected_profile_version` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_error` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "avatar_uploads_keys_valid" CHECK(length("avatar_uploads"."idempotency_key") > 0 AND length("avatar_uploads"."object_key") > 0 AND length("avatar_uploads"."file_hash") = 64 AND "avatar_uploads"."file_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "avatar_uploads_image_valid" CHECK("avatar_uploads"."content_type" = 'image/webp' AND "avatar_uploads"."width" = 512 AND "avatar_uploads"."height" = 512 AND "avatar_uploads"."size_bytes" BETWEEN 1 AND 1048576),
	CONSTRAINT "avatar_uploads_state_valid" CHECK("avatar_uploads"."state" IN ('pending', 'stored', 'committed', 'failed')),
	CONSTRAINT "avatar_uploads_version_dates_valid" CHECK("avatar_uploads"."expected_profile_version" >= 0 AND "avatar_uploads"."created_at" >= 0 AND "avatar_uploads"."updated_at" >= "avatar_uploads"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `avatar_uploads_idempotency_unique` ON `avatar_uploads` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `avatar_uploads_object_unique` ON `avatar_uploads` (`object_key`);--> statement-breakpoint
CREATE INDEX `avatar_uploads_reconcile_idx` ON `avatar_uploads` (`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `instance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`instance_version` integer NOT NULL,
	`kind` text NOT NULL,
	`from_user_id` text,
	`to_user_id` text NOT NULL,
	`grant_id` text,
	`trade_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `pokemon_instances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`grant_id`) REFERENCES `reward_grants`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "instance_events_kind_shape" CHECK(("instance_events"."kind" = 'issued' AND "instance_events"."from_user_id" IS NULL AND "instance_events"."grant_id" IS NOT NULL AND "instance_events"."trade_id" IS NULL AND "instance_events"."instance_version" = 0) OR ("instance_events"."kind" = 'traded' AND "instance_events"."from_user_id" IS NOT NULL AND "instance_events"."from_user_id" <> "instance_events"."to_user_id" AND "instance_events"."grant_id" IS NULL AND "instance_events"."trade_id" IS NOT NULL AND "instance_events"."instance_version" > 0)),
	CONSTRAINT "instance_events_dates_valid" CHECK("instance_events"."created_at" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instance_events_version_unique` ON `instance_events` (`instance_id`,`instance_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `instance_events_trade_unique` ON `instance_events` (`trade_id`,`instance_id`) WHERE "instance_events"."kind" = 'traded';--> statement-breakpoint
CREATE INDEX `instance_events_grant_idx` ON `instance_events` (`grant_id`);--> statement-breakpoint
CREATE INDEX `instance_events_recipient_idx` ON `instance_events` (`to_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `media_cleanup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`reason` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`lease_expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_error` text,
	FOREIGN KEY (`object_key`) REFERENCES `avatar_uploads`(`object_key`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "media_cleanup_jobs_reason_valid" CHECK("media_cleanup_jobs"."reason" IN ('replaced', 'removed', 'abandoned', 'failed')),
	CONSTRAINT "media_cleanup_jobs_state_valid" CHECK("media_cleanup_jobs"."state" IN ('pending', 'processing', 'completed')),
	CONSTRAINT "media_cleanup_jobs_lease_shape" CHECK(("media_cleanup_jobs"."state" = 'processing' AND "media_cleanup_jobs"."lease_expires_at" IS NOT NULL AND "media_cleanup_jobs"."lease_expires_at" > "media_cleanup_jobs"."updated_at") OR ("media_cleanup_jobs"."state" <> 'processing' AND "media_cleanup_jobs"."lease_expires_at" IS NULL)),
	CONSTRAINT "media_cleanup_jobs_dates_valid" CHECK("media_cleanup_jobs"."attempts" >= 0 AND "media_cleanup_jobs"."created_at" >= 0 AND "media_cleanup_jobs"."updated_at" >= "media_cleanup_jobs"."created_at" AND "media_cleanup_jobs"."next_attempt_at" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_cleanup_jobs_active_unique` ON `media_cleanup_jobs` (`object_key`) WHERE "media_cleanup_jobs"."state" IN ('pending', 'processing');--> statement-breakpoint
CREATE INDEX `media_cleanup_jobs_due_idx` ON `media_cleanup_jobs` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `poke_drops` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`cancelled_at` integer,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "poke_drops_hash_valid" CHECK(length("poke_drops"."token_hash") = 64 AND "poke_drops"."token_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "poke_drops_dates_valid" CHECK("poke_drops"."created_at" >= 0 AND "poke_drops"."expires_at" > "poke_drops"."created_at" AND ("poke_drops"."cancelled_at" IS NULL OR "poke_drops"."cancelled_at" >= "poke_drops"."created_at") AND "poke_drops"."version" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `poke_drops_token_unique` ON `poke_drops` (`token_hash`);--> statement-breakpoint
CREATE INDEX `poke_drops_creator_created_idx` ON `poke_drops` (`creator_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `poke_drops_expiry_idx` ON `poke_drops` (`expires_at`);--> statement-breakpoint
CREATE TABLE `pokemon_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`species_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`grant_id` text NOT NULL,
	`grant_slot` integer NOT NULL,
	`is_protected` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`acquired_at` integer NOT NULL,
	FOREIGN KEY (`species_id`) REFERENCES `pokemon_species`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`grant_id`) REFERENCES `reward_grants`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "pokemon_instances_slot_valid" CHECK("pokemon_instances"."grant_slot" BETWEEN 0 AND 2),
	CONSTRAINT "pokemon_instances_protected_valid" CHECK("pokemon_instances"."is_protected" IN (0, 1)),
	CONSTRAINT "pokemon_instances_version_dates_valid" CHECK("pokemon_instances"."version" >= 0 AND "pokemon_instances"."created_at" >= 0 AND "pokemon_instances"."acquired_at" >= "pokemon_instances"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pokemon_instances_grant_slot_unique` ON `pokemon_instances` (`grant_id`,`grant_slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `pokemon_instances_protected_unique` ON `pokemon_instances` (`owner_id`,`species_id`) WHERE "pokemon_instances"."is_protected" = 1;--> statement-breakpoint
CREATE INDEX `pokemon_instances_collection_idx` ON `pokemon_instances` (`owner_id`,`species_id`,`is_protected`);--> statement-breakpoint
CREATE TABLE `pokemon_species` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`image_path` text NOT NULL,
	CONSTRAINT "pokemon_species_id_valid" CHECK("pokemon_species"."id" BETWEEN 1 AND 151),
	CONSTRAINT "pokemon_species_content_valid" CHECK(length(trim("pokemon_species"."name")) > 0 AND length(trim("pokemon_species"."image_path")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pokemon_species_name_unique` ON `pokemon_species` (`name`);--> statement-breakpoint
CREATE TABLE `reward_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`drop_id` text,
	`draw_count` integer NOT NULL,
	`probabilities_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`drop_id`) REFERENCES `poke_drops`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reward_grants_kind_shape" CHECK(("reward_grants"."kind" = 'initial' AND "reward_grants"."drop_id" IS NULL AND "reward_grants"."draw_count" = 1) OR ("reward_grants"."kind" = 'drop' AND "reward_grants"."drop_id" IS NOT NULL AND "reward_grants"."draw_count" = 3)),
	CONSTRAINT "reward_grants_version_dates_valid" CHECK("reward_grants"."probabilities_version" > 0 AND "reward_grants"."created_at" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reward_grants_initial_unique` ON `reward_grants` (`user_id`) WHERE "reward_grants"."kind" = 'initial';--> statement-breakpoint
CREATE UNIQUE INDEX `reward_grants_redemption_unique` ON `reward_grants` (`drop_id`,`user_id`) WHERE "reward_grants"."kind" = 'drop';--> statement-breakpoint
CREATE INDEX `reward_grants_user_created_idx` ON `reward_grants` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sessions_hash_valid" CHECK(length("sessions"."token_hash") = 64 AND "sessions"."token_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "sessions_dates_valid" CHECK("sessions"."created_at" >= 0 AND "sessions"."expires_at" > "sessions"."created_at" AND ("sessions"."revoked_at" IS NULL OR "sessions"."revoked_at" >= "sessions"."created_at"))
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `trade_reservations` (
	`instance_id` text PRIMARY KEY NOT NULL,
	`trade_id` text NOT NULL,
	`user_id` text NOT NULL,
	`side` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `pokemon_instances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "trade_reservations_side_valid" CHECK("trade_reservations"."side" IN ('offer', 'proposal')),
	CONSTRAINT "trade_reservations_dates_valid" CHECK("trade_reservations"."created_at" >= 0 AND "trade_reservations"."expires_at" > "trade_reservations"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trade_reservations_side_unique` ON `trade_reservations` (`trade_id`,`side`);--> statement-breakpoint
CREATE INDEX `trade_reservations_expiry_idx` ON `trade_reservations` (`expires_at`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`offerer_id` text NOT NULL,
	`offered_instance_id` text NOT NULL,
	`proposer_id` text,
	`proposed_instance_id` text,
	`token_hash` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`offer_expires_at` integer NOT NULL,
	`proposed_at` integer,
	`proposal_expires_at` integer,
	`closed_at` integer,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`offerer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`offered_instance_id`) REFERENCES `pokemon_instances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proposer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`proposed_instance_id`) REFERENCES `pokemon_instances`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "trades_hash_valid" CHECK(length("trades"."token_hash") = 64 AND "trades"."token_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "trades_state_valid" CHECK("trades"."state" IN ('open', 'pending', 'completed', 'rejected', 'cancelled', 'expired')),
	CONSTRAINT "trades_proposal_shape" CHECK(("trades"."proposer_id" IS NULL AND "trades"."proposed_instance_id" IS NULL AND "trades"."proposed_at" IS NULL AND "trades"."proposal_expires_at" IS NULL) OR ("trades"."proposer_id" IS NOT NULL AND "trades"."proposed_instance_id" IS NOT NULL AND "trades"."proposed_at" IS NOT NULL AND "trades"."proposal_expires_at" IS NOT NULL AND "trades"."proposer_id" <> "trades"."offerer_id" AND "trades"."proposed_instance_id" <> "trades"."offered_instance_id" AND "trades"."proposed_at" >= "trades"."created_at" AND "trades"."proposed_at" < "trades"."offer_expires_at" AND "trades"."proposal_expires_at" > "trades"."proposed_at")),
	CONSTRAINT "trades_state_shape" CHECK(("trades"."state" <> 'open' OR "trades"."proposer_id" IS NULL) AND ("trades"."state" NOT IN ('pending', 'completed', 'rejected') OR "trades"."proposer_id" IS NOT NULL)),
	CONSTRAINT "trades_closed_shape" CHECK(("trades"."state" IN ('open', 'pending') AND "trades"."closed_at" IS NULL) OR ("trades"."state" IN ('completed', 'rejected', 'cancelled', 'expired') AND "trades"."closed_at" IS NOT NULL AND "trades"."closed_at" >= "trades"."created_at")),
	CONSTRAINT "trades_version_dates_valid" CHECK("trades"."version" >= 0 AND "trades"."created_at" >= 0 AND "trades"."offer_expires_at" > "trades"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trades_token_unique` ON `trades` (`token_hash`);--> statement-breakpoint
CREATE INDEX `trades_offerer_state_idx` ON `trades` (`offerer_id`,`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `trades_proposer_state_idx` ON `trades` (`proposer_id`,`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `trades_offer_expiry_idx` ON `trades` (`state`,`offer_expires_at`);--> statement-breakpoint
CREATE INDEX `trades_proposal_expiry_idx` ON `trades` (`state`,`proposal_expires_at`);--> statement-breakpoint
CREATE TABLE `transaction_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`ok` integer NOT NULL,
	CONSTRAINT "transaction_guards_ok" CHECK("transaction_guards"."ok" = 1)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`senati_id` text NOT NULL,
	`first_names` text NOT NULL,
	`last_names` text NOT NULL,
	`birth_date` text NOT NULL,
	`trainer_name` text NOT NULL,
	`trainer_name_key` text NOT NULL,
	`trainer_name_version` integer NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'student' NOT NULL,
	`avatar_object_key` text,
	`profile_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`avatar_object_key`) REFERENCES `avatar_uploads`(`object_key`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "users_senati_format" CHECK(length("users"."senati_id") BETWEEN 1 AND 32 AND "users"."senati_id" = trim("users"."senati_id") AND "users"."senati_id" = upper("users"."senati_id") AND instr("users"."senati_id", ' ') = 0 AND instr("users"."senati_id", char(9)) = 0 AND instr("users"."senati_id", char(10)) = 0 AND instr("users"."senati_id", char(13)) = 0),
	CONSTRAINT "users_names_valid" CHECK(length(trim("users"."first_names")) BETWEEN 1 AND 100 AND length(trim("users"."last_names")) BETWEEN 1 AND 100),
	CONSTRAINT "users_birth_date_valid" CHECK(length("users"."birth_date") = 10 AND "users"."birth_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND "users"."birth_date" >= '0001-01-01' AND date("users"."birth_date", '+0 days') IS NOT NULL AND date("users"."birth_date", '+0 days') = "users"."birth_date"),
	CONSTRAINT "users_alias_valid" CHECK(length(trim("users"."trainer_name")) > 0 AND length(trim("users"."trainer_name_key")) > 0 AND "users"."trainer_name_version" > 0),
	CONSTRAINT "users_password_hash_present" CHECK(length("users"."password_hash") > 0),
	CONSTRAINT "users_role_valid" CHECK("users"."role" IN ('student', 'teacher')),
	CONSTRAINT "users_version_dates_valid" CHECK("users"."profile_version" >= 0 AND "users"."created_at" >= 0 AND "users"."updated_at" >= "users"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_senati_id_unique` ON `users` (`senati_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_trainer_key_unique` ON `users` (`trainer_name_key`);--> statement-breakpoint
CREATE INDEX `users_role_created_idx` ON `users` (`role`,`created_at`,`id`);