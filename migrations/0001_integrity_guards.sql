-- Cross-row invariants cannot be expressed by SQLite CHECK constraints.
-- Keep these reviewed triggers alongside the generated Drizzle schema.
-- Parenthesize CASE expressions for the remote D1 SQL statement splitter.
-- https://github.com/cloudflare/workers-sdk/issues/4727
CREATE TRIGGER poke_drops_teacher_insert
BEFORE INSERT ON poke_drops
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.creator_id AND role = 'teacher'
  ) THEN RAISE(ABORT, 'drop_requires_teacher') END);
END;
--> statement-breakpoint
CREATE TRIGGER reward_grants_immutable
BEFORE UPDATE ON reward_grants
BEGIN
  SELECT RAISE(ABORT, 'reward_grant_is_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER pokemon_instances_issue_guard
BEFORE INSERT ON pokemon_instances
BEGIN
  SELECT (CASE WHEN NEW.version <> 0 OR NOT EXISTS (
    SELECT 1 FROM reward_grants
    WHERE id = NEW.grant_id AND user_id = NEW.owner_id
      AND NEW.grant_slot < draw_count AND NEW.created_at >= created_at
  ) THEN RAISE(ABORT, 'invalid_reward_instance') END);
  SELECT (CASE WHEN NEW.is_protected <> CASE WHEN EXISTS (
    SELECT 1 FROM pokemon_instances
    WHERE owner_id = NEW.owner_id AND species_id = NEW.species_id AND is_protected = 1
  ) THEN 0 ELSE 1 END THEN RAISE(ABORT, 'first_instance_must_be_protected') END);
END;
--> statement-breakpoint
CREATE TRIGGER pokemon_instances_provenance_immutable
BEFORE UPDATE OF species_id, grant_id, grant_slot, created_at ON pokemon_instances
WHEN NEW.species_id <> OLD.species_id OR NEW.grant_id <> OLD.grant_id
  OR NEW.grant_slot <> OLD.grant_slot OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'instance_provenance_is_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER pokemon_instances_protection_update
BEFORE UPDATE OF owner_id, is_protected ON pokemon_instances
BEGIN
  SELECT (CASE WHEN OLD.is_protected = 1 AND
    (NEW.owner_id <> OLD.owner_id OR NEW.is_protected <> 1)
    THEN RAISE(ABORT, 'protected_instance_cannot_leave') END);
  SELECT (CASE WHEN NEW.owner_id <> OLD.owner_id AND NEW.is_protected <> CASE WHEN EXISTS (
    SELECT 1 FROM pokemon_instances
    WHERE owner_id = NEW.owner_id AND species_id = NEW.species_id AND is_protected = 1
  ) THEN 0 ELSE 1 END THEN RAISE(ABORT, 'incoming_instance_protection_invalid') END);
END;
--> statement-breakpoint
CREATE TRIGGER pokemon_instances_protection_delete
BEFORE DELETE ON pokemon_instances WHEN OLD.is_protected = 1
BEGIN
  SELECT RAISE(ABORT, 'protected_instance_cannot_be_deleted');
END;
--> statement-breakpoint
CREATE TRIGGER trade_reservations_insert_guard
BEFORE INSERT ON trade_reservations
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM pokemon_instances
    WHERE id = NEW.instance_id AND owner_id = NEW.user_id AND is_protected = 0
  ) THEN RAISE(ABORT, 'reservation_requires_owned_duplicate') END);
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM trades
    WHERE id = NEW.trade_id AND state IN ('open', 'pending')
      AND ((NEW.side = 'offer' AND offered_instance_id = NEW.instance_id AND offerer_id = NEW.user_id)
        OR (NEW.side = 'proposal' AND state = 'pending' AND proposed_instance_id = NEW.instance_id AND proposer_id = NEW.user_id))
      AND NEW.created_at >= created_at
      AND NEW.expires_at = CASE WHEN state = 'open' THEN offer_expires_at ELSE proposal_expires_at END
  ) THEN RAISE(ABORT, 'reservation_does_not_match_trade') END);
END;
--> statement-breakpoint
CREATE TRIGGER trade_reservations_identity_immutable
BEFORE UPDATE OF instance_id, trade_id, user_id, side, created_at ON trade_reservations
WHEN NEW.instance_id <> OLD.instance_id OR NEW.trade_id <> OLD.trade_id
  OR NEW.user_id <> OLD.user_id OR NEW.side <> OLD.side OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'reservation_identity_is_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER users_avatar_owner_insert
BEFORE INSERT ON users WHEN NEW.avatar_object_key IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM avatar_uploads WHERE object_key = NEW.avatar_object_key
      AND user_id = NEW.id AND state IN ('stored', 'committed')
  ) THEN RAISE(ABORT, 'avatar_requires_owned_stored_upload') END);
END;
--> statement-breakpoint
CREATE TRIGGER users_avatar_owner_update
BEFORE UPDATE OF avatar_object_key ON users WHEN NEW.avatar_object_key IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM avatar_uploads WHERE object_key = NEW.avatar_object_key
      AND user_id = NEW.id AND state IN ('stored', 'committed')
  ) THEN RAISE(ABORT, 'avatar_requires_owned_stored_upload') END);
END;
--> statement-breakpoint
CREATE TRIGGER avatar_uploads_identity_immutable
BEFORE UPDATE OF user_id, object_key, idempotency_key, file_hash ON avatar_uploads
WHEN NEW.user_id <> OLD.user_id OR NEW.object_key <> OLD.object_key
  OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.file_hash <> OLD.file_hash
BEGIN
  SELECT RAISE(ABORT, 'upload_identity_is_immutable');
END;
