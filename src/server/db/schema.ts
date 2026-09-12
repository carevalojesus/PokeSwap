import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// IDs and timestamps are supplied by services. All instants are Unix seconds;
// birthDate is a calendar date and is never converted to an instant.
const id = () => text('id').primaryKey();
const createdAt = () => integer('created_at').notNull();
const version = () => integer('version').notNull().default(0);

export const users = sqliteTable(
  'users',
  {
    id: id(),
    senatiId: text('senati_id').notNull(),
    firstNames: text('first_names').notNull(),
    lastNames: text('last_names').notNull(),
    birthDate: text('birth_date').notNull(),
    trainerName: text('trainer_name').notNull(),
    trainerNameKey: text('trainer_name_key').notNull(),
    trainerNameVersion: integer('trainer_name_version').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['student', 'teacher'] })
      .notNull()
      .default('student'),
    avatarObjectKey: text('avatar_object_key').references(
      (): AnySQLiteColumn => avatarUploads.objectKey,
      { onDelete: 'restrict' },
    ),
    profileVersion: integer('profile_version').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('users_senati_id_unique').on(t.senatiId),
    uniqueIndex('users_trainer_key_unique').on(t.trainerNameKey),
    index('users_role_created_idx').on(t.role, t.createdAt, t.id),
    check(
      'users_senati_format',
      sql`length(${t.senatiId}) BETWEEN 1 AND 32 AND ${t.senatiId} = trim(${t.senatiId}) AND ${t.senatiId} = upper(${t.senatiId}) AND instr(${t.senatiId}, ' ') = 0 AND instr(${t.senatiId}, char(9)) = 0 AND instr(${t.senatiId}, char(10)) = 0 AND instr(${t.senatiId}, char(13)) = 0`,
    ),
    check(
      'users_names_valid',
      sql`length(trim(${t.firstNames})) BETWEEN 1 AND 100 AND length(trim(${t.lastNames})) BETWEEN 1 AND 100`,
    ),
    check(
      'users_birth_date_valid',
      sql`length(${t.birthDate}) = 10 AND ${t.birthDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND ${t.birthDate} >= '0001-01-01' AND date(${t.birthDate}, '+0 days') IS NOT NULL AND date(${t.birthDate}, '+0 days') = ${t.birthDate}`,
    ),
    check(
      'users_alias_valid',
      sql`length(trim(${t.trainerName})) > 0 AND length(trim(${t.trainerNameKey})) > 0 AND ${t.trainerNameVersion} > 0`,
    ),
    check('users_password_hash_present', sql`length(${t.passwordHash}) > 0`),
    check('users_role_valid', sql`${t.role} IN ('student', 'teacher')`),
    check(
      'users_version_dates_valid',
      sql`${t.profileVersion} >= 0 AND ${t.createdAt} >= 0 AND ${t.updatedAt} >= ${t.createdAt}`,
    ),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_expiry_idx').on(t.expiresAt),
    check(
      'sessions_hash_valid',
      sql`length(${t.tokenHash}) = 64 AND ${t.tokenHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'sessions_dates_valid',
      sql`${t.createdAt} >= 0 AND ${t.expiresAt} > ${t.createdAt} AND (${t.revokedAt} IS NULL OR ${t.revokedAt} >= ${t.createdAt})`,
    ),
  ],
);

export const pokemonSpecies = sqliteTable(
  'pokemon_species',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    imagePath: text('image_path').notNull(),
  },
  (t) => [
    uniqueIndex('pokemon_species_name_unique').on(t.name),
    check('pokemon_species_id_valid', sql`${t.id} BETWEEN 1 AND 151`),
    check(
      'pokemon_species_content_valid',
      sql`length(trim(${t.name})) > 0 AND length(trim(${t.imagePath})) > 0`,
    ),
  ],
);

export const pokeDrops = sqliteTable(
  'poke_drops',
  {
    id: id(),
    creatorId: text('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: createdAt(),
    expiresAt: integer('expires_at').notNull(),
    cancelledAt: integer('cancelled_at'),
    version: version(),
  },
  (t) => [
    uniqueIndex('poke_drops_token_unique').on(t.tokenHash),
    index('poke_drops_creator_created_idx').on(t.creatorId, t.createdAt),
    index('poke_drops_expiry_idx').on(t.expiresAt),
    check(
      'poke_drops_hash_valid',
      sql`length(${t.tokenHash}) = 64 AND ${t.tokenHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'poke_drops_dates_valid',
      sql`${t.createdAt} >= 0 AND ${t.expiresAt} > ${t.createdAt} AND (${t.cancelledAt} IS NULL OR ${t.cancelledAt} >= ${t.createdAt}) AND ${t.version} >= 0`,
    ),
  ],
);

// A grant is the durable operation/result envelope, including a drop redemption.
export const rewardGrants = sqliteTable(
  'reward_grants',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    kind: text('kind', { enum: ['initial', 'drop'] }).notNull(),
    dropId: text('drop_id').references(() => pokeDrops.id, {
      onDelete: 'restrict',
    }),
    drawCount: integer('draw_count').notNull(),
    probabilitiesVersion: integer('probabilities_version').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('reward_grants_initial_unique')
      .on(t.userId)
      .where(sql`${t.kind} = 'initial'`),
    uniqueIndex('reward_grants_redemption_unique')
      .on(t.dropId, t.userId)
      .where(sql`${t.kind} = 'drop'`),
    index('reward_grants_user_created_idx').on(t.userId, t.createdAt),
    check(
      'reward_grants_kind_shape',
      sql`(${t.kind} = 'initial' AND ${t.dropId} IS NULL AND ${t.drawCount} = 1) OR (${t.kind} = 'drop' AND ${t.dropId} IS NOT NULL AND ${t.drawCount} = 3)`,
    ),
    check(
      'reward_grants_version_dates_valid',
      sql`${t.probabilitiesVersion} > 0 AND ${t.createdAt} >= 0`,
    ),
  ],
);

export const pokemonInstances = sqliteTable(
  'pokemon_instances',
  {
    id: id(),
    speciesId: integer('species_id')
      .notNull()
      .references(() => pokemonSpecies.id, { onDelete: 'restrict' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    grantId: text('grant_id')
      .notNull()
      .references(() => rewardGrants.id, { onDelete: 'restrict' }),
    grantSlot: integer('grant_slot').notNull(),
    isProtected: integer('is_protected', { mode: 'boolean' })
      .notNull()
      .default(false),
    version: version(),
    createdAt: createdAt(),
    acquiredAt: integer('acquired_at').notNull(),
  },
  (t) => [
    uniqueIndex('pokemon_instances_grant_slot_unique').on(
      t.grantId,
      t.grantSlot,
    ),
    uniqueIndex('pokemon_instances_protected_unique')
      .on(t.ownerId, t.speciesId)
      .where(sql`${t.isProtected} = 1`),
    index('pokemon_instances_collection_idx').on(
      t.ownerId,
      t.speciesId,
      t.isProtected,
    ),
    check('pokemon_instances_slot_valid', sql`${t.grantSlot} BETWEEN 0 AND 2`),
    check('pokemon_instances_protected_valid', sql`${t.isProtected} IN (0, 1)`),
    check(
      'pokemon_instances_version_dates_valid',
      sql`${t.version} >= 0 AND ${t.createdAt} >= 0 AND ${t.acquiredAt} >= ${t.createdAt}`,
    ),
  ],
);

export const trades = sqliteTable(
  'trades',
  {
    id: id(),
    offererId: text('offerer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    offeredInstanceId: text('offered_instance_id')
      .notNull()
      .references(() => pokemonInstances.id, { onDelete: 'restrict' }),
    proposerId: text('proposer_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    proposedInstanceId: text('proposed_instance_id').references(
      () => pokemonInstances.id,
      { onDelete: 'restrict' },
    ),
    tokenHash: text('token_hash').notNull(),
    state: text('state', {
      enum: [
        'open',
        'pending',
        'completed',
        'rejected',
        'cancelled',
        'expired',
      ],
    })
      .notNull()
      .default('open'),
    createdAt: createdAt(),
    offerExpiresAt: integer('offer_expires_at').notNull(),
    proposedAt: integer('proposed_at'),
    proposalExpiresAt: integer('proposal_expires_at'),
    closedAt: integer('closed_at'),
    version: version(),
  },
  (t) => [
    uniqueIndex('trades_token_unique').on(t.tokenHash),
    index('trades_offerer_state_idx').on(t.offererId, t.state, t.createdAt),
    index('trades_proposer_state_idx').on(t.proposerId, t.state, t.createdAt),
    index('trades_offer_expiry_idx').on(t.state, t.offerExpiresAt),
    index('trades_proposal_expiry_idx').on(t.state, t.proposalExpiresAt),
    check(
      'trades_hash_valid',
      sql`length(${t.tokenHash}) = 64 AND ${t.tokenHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'trades_state_valid',
      sql`${t.state} IN ('open', 'pending', 'completed', 'rejected', 'cancelled', 'expired')`,
    ),
    check(
      'trades_proposal_shape',
      sql`(${t.proposerId} IS NULL AND ${t.proposedInstanceId} IS NULL AND ${t.proposedAt} IS NULL AND ${t.proposalExpiresAt} IS NULL) OR (${t.proposerId} IS NOT NULL AND ${t.proposedInstanceId} IS NOT NULL AND ${t.proposedAt} IS NOT NULL AND ${t.proposalExpiresAt} IS NOT NULL AND ${t.proposerId} <> ${t.offererId} AND ${t.proposedInstanceId} <> ${t.offeredInstanceId} AND ${t.proposedAt} >= ${t.createdAt} AND ${t.proposedAt} < ${t.offerExpiresAt} AND ${t.proposalExpiresAt} > ${t.proposedAt})`,
    ),
    check(
      'trades_state_shape',
      sql`(${t.state} <> 'open' OR ${t.proposerId} IS NULL) AND (${t.state} NOT IN ('pending', 'completed', 'rejected') OR ${t.proposerId} IS NOT NULL)`,
    ),
    check(
      'trades_closed_shape',
      sql`(${t.state} IN ('open', 'pending') AND ${t.closedAt} IS NULL) OR (${t.state} IN ('completed', 'rejected', 'cancelled', 'expired') AND ${t.closedAt} IS NOT NULL AND ${t.closedAt} >= ${t.createdAt})`,
    ),
    check(
      'trades_version_dates_valid',
      sql`${t.version} >= 0 AND ${t.createdAt} >= 0 AND ${t.offerExpiresAt} > ${t.createdAt}`,
    ),
  ],
);

// Only active reservations are stored. Expired rows must be released atomically
// before reuse; a timestamp alone does not bypass the primary key.
export const tradeReservations = sqliteTable(
  'trade_reservations',
  {
    instanceId: text('instance_id')
      .primaryKey()
      .references(() => pokemonInstances.id, { onDelete: 'restrict' }),
    tradeId: text('trade_id')
      .notNull()
      .references(() => trades.id, { onDelete: 'restrict' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    side: text('side', { enum: ['offer', 'proposal'] }).notNull(),
    createdAt: createdAt(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    uniqueIndex('trade_reservations_side_unique').on(t.tradeId, t.side),
    index('trade_reservations_expiry_idx').on(t.expiresAt),
    check(
      'trade_reservations_side_valid',
      sql`${t.side} IN ('offer', 'proposal')`,
    ),
    check(
      'trade_reservations_dates_valid',
      sql`${t.createdAt} >= 0 AND ${t.expiresAt} > ${t.createdAt}`,
    ),
  ],
);

export const instanceEvents = sqliteTable(
  'instance_events',
  {
    id: id(),
    instanceId: text('instance_id')
      .notNull()
      .references(() => pokemonInstances.id, { onDelete: 'restrict' }),
    instanceVersion: integer('instance_version').notNull(),
    kind: text('kind', { enum: ['issued', 'traded'] }).notNull(),
    fromUserId: text('from_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    grantId: text('grant_id').references(() => rewardGrants.id, {
      onDelete: 'restrict',
    }),
    tradeId: text('trade_id').references(() => trades.id, {
      onDelete: 'restrict',
    }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('instance_events_version_unique').on(
      t.instanceId,
      t.instanceVersion,
    ),
    uniqueIndex('instance_events_trade_unique')
      .on(t.tradeId, t.instanceId)
      .where(sql`${t.kind} = 'traded'`),
    index('instance_events_grant_idx').on(t.grantId),
    index('instance_events_recipient_idx').on(t.toUserId, t.createdAt),
    check(
      'instance_events_kind_shape',
      sql`(${t.kind} = 'issued' AND ${t.fromUserId} IS NULL AND ${t.grantId} IS NOT NULL AND ${t.tradeId} IS NULL AND ${t.instanceVersion} = 0) OR (${t.kind} = 'traded' AND ${t.fromUserId} IS NOT NULL AND ${t.fromUserId} <> ${t.toUserId} AND ${t.grantId} IS NULL AND ${t.tradeId} IS NOT NULL AND ${t.instanceVersion} > 0)`,
    ),
    check('instance_events_dates_valid', sql`${t.createdAt} >= 0`),
  ],
);

export const avatarUploads = sqliteTable(
  'avatar_uploads',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references((): AnySQLiteColumn => users.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    fileHash: text('file_hash').notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull().default('image/webp'),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    expectedProfileVersion: integer('expected_profile_version').notNull(),
    state: text('state', { enum: ['pending', 'stored', 'committed', 'failed'] })
      .notNull()
      .default('pending'),
    createdAt: createdAt(),
    updatedAt: integer('updated_at').notNull(),
    lastError: text('last_error'),
  },
  (t) => [
    uniqueIndex('avatar_uploads_idempotency_unique').on(
      t.userId,
      t.idempotencyKey,
    ),
    uniqueIndex('avatar_uploads_object_unique').on(t.objectKey),
    index('avatar_uploads_reconcile_idx').on(t.state, t.updatedAt),
    check(
      'avatar_uploads_keys_valid',
      sql`length(${t.idempotencyKey}) > 0 AND length(${t.objectKey}) > 0 AND length(${t.fileHash}) = 64 AND ${t.fileHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      'avatar_uploads_image_valid',
      sql`${t.contentType} = 'image/webp' AND ${t.width} = 512 AND ${t.height} = 512 AND ${t.sizeBytes} BETWEEN 1 AND 1048576`,
    ),
    check(
      'avatar_uploads_state_valid',
      sql`${t.state} IN ('pending', 'stored', 'committed', 'failed')`,
    ),
    check(
      'avatar_uploads_version_dates_valid',
      sql`${t.expectedProfileVersion} >= 0 AND ${t.createdAt} >= 0 AND ${t.updatedAt} >= ${t.createdAt}`,
    ),
  ],
);

export const mediaCleanupJobs = sqliteTable(
  'media_cleanup_jobs',
  {
    id: id(),
    objectKey: text('object_key')
      .notNull()
      .references(() => avatarUploads.objectKey, { onDelete: 'restrict' }),
    reason: text('reason', {
      enum: ['replaced', 'removed', 'abandoned', 'failed'],
    }).notNull(),
    state: text('state', { enum: ['pending', 'processing', 'completed'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: integer('next_attempt_at').notNull(),
    leaseExpiresAt: integer('lease_expires_at'),
    createdAt: createdAt(),
    updatedAt: integer('updated_at').notNull(),
    lastError: text('last_error'),
  },
  (t) => [
    uniqueIndex('media_cleanup_jobs_active_unique')
      .on(t.objectKey)
      .where(sql`${t.state} IN ('pending', 'processing')`),
    index('media_cleanup_jobs_due_idx').on(t.state, t.nextAttemptAt),
    check(
      'media_cleanup_jobs_reason_valid',
      sql`${t.reason} IN ('replaced', 'removed', 'abandoned', 'failed')`,
    ),
    check(
      'media_cleanup_jobs_state_valid',
      sql`${t.state} IN ('pending', 'processing', 'completed')`,
    ),
    check(
      'media_cleanup_jobs_lease_shape',
      sql`(${t.state} = 'processing' AND ${t.leaseExpiresAt} IS NOT NULL AND ${t.leaseExpiresAt} > ${t.updatedAt}) OR (${t.state} <> 'processing' AND ${t.leaseExpiresAt} IS NULL)`,
    ),
    check(
      'media_cleanup_jobs_dates_valid',
      sql`${t.attempts} >= 0 AND ${t.createdAt} >= 0 AND ${t.updatedAt} >= ${t.createdAt} AND ${t.nextAttemptAt} >= 0`,
    ),
  ],
);

// Transient assertions inside one D1 batch. A false assertion raises a SQL
// error so earlier writes roll back too. Delete successful guards in that batch.
export const transactionGuards = sqliteTable(
  'transaction_guards',
  {
    id: id(),
    ok: integer('ok').notNull(),
  },
  (t) => [check('transaction_guards_ok', sql`${t.ok} = 1`)],
);
