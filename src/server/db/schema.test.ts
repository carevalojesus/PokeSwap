import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase } from './client';
import * as s from './schema';

const db = createDatabase(env.DB);
const now = 1_800_000_000;
const uid = () => crypto.randomUUID();
const hash = () => uid().replaceAll('-', '').repeat(2);
const user = (role: 'student' | 'teacher' = 'student') => ({
  id: uid(),
  senatiId: uid().replaceAll('-', '').toUpperCase(),
  firstNames: 'Ana María',
  lastNames: 'Arévalo Pérez',
  birthDate: '2004-02-29',
  trainerName: 'Kairo del Trueno',
  trainerNameKey: uid(),
  trainerNameVersion: 1,
  passwordHash: 'fixture-only-not-a-real-password-hash',
  role,
  createdAt: now,
  updatedAt: now,
});

beforeAll(async () => {
  await applyD1Migrations(env.DB, inject('migrations'));
});

async function fixture() {
  const alice = user();
  const bob = user();
  const teacher = user('teacher');
  const drop = {
    id: uid(),
    creatorId: teacher.id,
    tokenHash: hash(),
    createdAt: now,
    expiresAt: now + 1800,
  };
  const grants = [
    {
      id: uid(),
      userId: alice.id,
      kind: 'initial' as const,
      dropId: null,
      drawCount: 1,
      probabilitiesVersion: 1,
      createdAt: now,
    },
    {
      id: uid(),
      userId: bob.id,
      kind: 'initial' as const,
      dropId: null,
      drawCount: 1,
      probabilitiesVersion: 1,
      createdAt: now,
    },
    {
      id: uid(),
      userId: alice.id,
      kind: 'drop' as const,
      dropId: drop.id,
      drawCount: 3,
      probabilitiesVersion: 1,
      createdAt: now,
    },
    {
      id: uid(),
      userId: bob.id,
      kind: 'drop' as const,
      dropId: drop.id,
      drawCount: 3,
      probabilitiesVersion: 1,
      createdAt: now,
    },
  ];
  const instance = (
    ownerId: string,
    speciesId: number,
    grantId: string,
    grantSlot: number,
    isProtected: boolean,
  ) => ({
    id: uid(),
    ownerId,
    speciesId,
    grantId,
    grantSlot,
    isProtected,
    createdAt: now,
    acquiredAt: now,
  });
  const ap = instance(alice.id, 25, grants[0].id, 0, true);
  const bp = instance(bob.id, 1, grants[1].id, 0, true);
  const a = instance(alice.id, 25, grants[2].id, 0, false);
  const b = instance(bob.id, 1, grants[3].id, 0, false);
  await db.batch([
    db.insert(s.users).values([alice, bob, teacher]),
    db.insert(s.pokeDrops).values(drop),
    db.insert(s.rewardGrants).values(grants),
    db
      .insert(s.pokemonInstances)
      .values([
        ap,
        bp,
        a,
        b,
        instance(alice.id, 25, grants[2].id, 1, false),
        instance(alice.id, 150, grants[2].id, 2, true),
        instance(bob.id, 1, grants[3].id, 1, false),
        instance(bob.id, 151, grants[3].id, 2, true),
      ]),
  ]);
  const offer = {
    id: uid(),
    offererId: alice.id,
    offeredInstanceId: a.id,
    tokenHash: hash(),
    createdAt: now,
    offerExpiresAt: now + 60,
  };
  return { alice, bob, teacher, drop, grants, ap, bp, a, b, offer };
}

// Exercise actual SQLite constraints through D1, not mocked repository methods.
describe('D1 migrations and identity', () => {
  it('applies migrations once and keeps all foreign keys valid', async () => {
    await applyD1Migrations(env.DB, inject('migrations'));
    expect(
      (await env.DB.prepare('SELECT name FROM d1_migrations').all()).results,
    ).toHaveLength(inject('migrations').length);
    expect(
      (await env.DB.prepare('PRAGMA foreign_key_check').all()).results,
    ).toEqual([]);
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all<{ name: string }>();
    for (const name of [
      'users',
      'sessions',
      'pokemon_species',
      'poke_drops',
      'reward_grants',
      'pokemon_instances',
      'trades',
      'trade_reservations',
      'instance_events',
      'avatar_uploads',
      'media_cleanup_jobs',
      'transaction_guards',
    ]) {
      expect(tables.results.map((row) => row.name)).toContain(name);
    }
  });

  it('preserves ID leading zeros and accents, while forbidding duplicate IDs and aliases', async () => {
    const first = {
      ...user(),
      senatiId: '00' + uid().replaceAll('-', '').slice(0, 20).toUpperCase(),
    };
    await db.insert(s.users).values(first);
    const result = await db
      .select()
      .from(s.users)
      .where(eq(s.users.id, first.id))
      .get();
    expect(result?.senatiId).toBe(first.senatiId);
    expect(result?.firstNames).toBe('Ana María');
    await expect(
      db.insert(s.users).values({ ...user(), senatiId: first.senatiId }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(s.users)
        .values({ ...user(), trainerNameKey: first.trainerNameKey }),
    ).rejects.toThrow();
    await db.insert(s.users).values(user()); // same legal names are allowed
  });

  it.each(['2003-02-29', '2004-02-30', '2026-13-01', '2026-1-01'])(
    'rejects invalid calendar date %s',
    async (birthDate) => {
      await expect(
        db.insert(s.users).values({ ...user(), birthDate }),
      ).rejects.toThrow();
    },
  );

  it('rejects a malformed ID and an unknown role at the SQL layer', async () => {
    await expect(
      db.insert(s.users).values({ ...user(), senatiId: 'ab 12' }),
    ).rejects.toThrow();
    const row = user();
    await db.insert(s.users).values(row);
    await expect(
      env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?")
        .bind(row.id)
        .run(),
    ).rejects.toThrow();
  });

  it('supports compare-and-swap for profile versions without silently overwriting', async () => {
    const row = user();
    await db.insert(s.users).values(row);
    const update = () =>
      env.DB.prepare(
        'UPDATE users SET first_names = ?, profile_version = profile_version + 1, updated_at = ? WHERE id = ? AND profile_version = ?',
      )
        .bind('María', now + 1, row.id, 0)
        .run();
    expect((await update()).meta.changes).toBe(1);
    expect((await update()).meta.changes).toBe(0);
  });

  it('enforces session ownership, unique hashes and expiry ordering', async () => {
    const row = user();
    await db.insert(s.users).values(row);
    const session = {
      tokenHash: hash(),
      userId: row.id,
      createdAt: now,
      expiresAt: now + 3600,
    };
    await db.insert(s.sessions).values(session);
    await expect(db.insert(s.sessions).values(session)).rejects.toThrow();
    await expect(
      db
        .insert(s.sessions)
        .values({ ...session, tokenHash: hash(), userId: uid() }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(s.sessions)
        .values({ ...session, tokenHash: hash(), expiresAt: now }),
    ).rejects.toThrow();
  });
});

describe('Rewards, collection and provenance', () => {
  it('only admits species 1–151', async () => {
    for (const id of [0, 152]) {
      await expect(
        db
          .insert(s.pokemonSpecies)
          .values({ id, name: uid(), imagePath: '/fixture' }),
      ).rejects.toThrow();
    }
  });

  it('accumulates duplicates with one protected instance per species', async () => {
    const f = await fixture();
    const rows = await db
      .select()
      .from(s.pokemonInstances)
      .where(eq(s.pokemonInstances.ownerId, f.alice.id));
    expect(rows).toHaveLength(4);
    const pikachu = rows.filter((row) => row.speciesId === 25);
    expect(pikachu).toHaveLength(3);
    expect(pikachu.filter((row) => row.isProtected)).toHaveLength(1);
  });

  it('rejects duplicate initial rewards and repeat drop redemptions', async () => {
    const f = await fixture();
    await expect(
      db.insert(s.rewardGrants).values({ ...f.grants[0], id: uid() }),
    ).rejects.toThrow();
    await expect(
      db.insert(s.rewardGrants).values({ ...f.grants[2], id: uid() }),
    ).rejects.toThrow();
    await expect(
      db
        .update(s.rewardGrants)
        .set({ probabilitiesVersion: 2 })
        .where(eq(s.rewardGrants.id, f.grants[0].id)),
    ).rejects.toThrow();
  });

  it('rejects reward shape errors and drops created by students', async () => {
    const f = await fixture();
    await expect(
      db.insert(s.pokeDrops).values({
        ...f.drop,
        id: uid(),
        tokenHash: hash(),
        creatorId: f.alice.id,
      }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(s.rewardGrants)
        .values({ ...f.grants[2], id: uid(), drawCount: 2 }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(s.rewardGrants)
        .values({ ...f.grants[0], id: uid(), dropId: f.drop.id }),
    ).rejects.toThrow();
  });

  it('rejects extra initial slots, repeated result slots and wrong reward owners', async () => {
    const f = await fixture();
    await expect(
      db
        .insert(s.pokemonInstances)
        .values({ ...f.ap, id: uid(), grantSlot: 1, isProtected: false }),
    ).rejects.toThrow();
    await expect(
      db.insert(s.pokemonInstances).values({ ...f.a, id: uid() }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(s.pokemonInstances)
        .values({ ...f.a, id: uid(), ownerId: f.bob.id, isProtected: true }),
    ).rejects.toThrow();
  });

  it('preserves provenance and prevents transferring, unprotecting or deleting the protected copy', async () => {
    const f = await fixture();
    await expect(
      db
        .update(s.pokemonInstances)
        .set({ ownerId: f.bob.id })
        .where(eq(s.pokemonInstances.id, f.ap.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(s.pokemonInstances)
        .set({ isProtected: false })
        .where(eq(s.pokemonInstances.id, f.ap.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(s.pokemonInstances).where(eq(s.pokemonInstances.id, f.ap.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(s.pokemonInstances)
        .set({ speciesId: 150 })
        .where(eq(s.pokemonInstances.id, f.a.id)),
    ).rejects.toThrow();
  });

  it('requires the first instance to be protected and rolls back its grant on batch failure', async () => {
    const row = user();
    await db.insert(s.users).values(row);
    const grantId = uid();
    await expect(
      db.batch([
        db.insert(s.rewardGrants).values({
          id: grantId,
          userId: row.id,
          kind: 'initial',
          drawCount: 1,
          probabilitiesVersion: 1,
          createdAt: now,
        }),
        db.insert(s.pokemonInstances).values({
          id: uid(),
          ownerId: row.id,
          speciesId: 25,
          grantId,
          grantSlot: 0,
          isProtected: false,
          createdAt: now,
          acquiredAt: now,
        }),
      ]),
    ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(s.rewardGrants)
        .where(eq(s.rewardGrants.id, grantId)),
    ).toEqual([]);
  });

  it('prevents duplicate history events for one instance version', async () => {
    const f = await fixture();
    const event = {
      id: uid(),
      instanceId: f.ap.id,
      instanceVersion: 0,
      kind: 'issued' as const,
      toUserId: f.alice.id,
      grantId: f.grants[0].id,
      createdAt: now,
    };
    await db.insert(s.instanceEvents).values(event);
    await expect(
      db.insert(s.instanceEvents).values({ ...event, id: uid() }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(s.instanceEvents)
        .values({ ...event, id: uid(), instanceVersion: 1 }),
    ).rejects.toThrow();
  });
});

describe('Trade structure and reservations', () => {
  it('prevents simultaneous reservations of the same instance', async () => {
    const f = await fixture();
    const other = { ...f.offer, id: uid(), tokenHash: hash() };
    await db.insert(s.trades).values([f.offer, other]);
    const reservation = {
      instanceId: f.a.id,
      tradeId: f.offer.id,
      userId: f.alice.id,
      side: 'offer' as const,
      createdAt: now,
      expiresAt: now + 60,
    };
    await db.insert(s.tradeReservations).values(reservation);
    await expect(
      db
        .insert(s.tradeReservations)
        .values({ ...reservation, tradeId: other.id }),
    ).rejects.toThrow();
    await db
      .delete(s.tradeReservations)
      .where(eq(s.tradeReservations.instanceId, f.a.id));
    await db
      .insert(s.tradeReservations)
      .values({ ...reservation, tradeId: other.id });
  });

  it('rejects protected, foreign-owned and mismatched reservations', async () => {
    const f = await fixture();
    await db.insert(s.trades).values(f.offer);
    const reservation = {
      instanceId: f.a.id,
      tradeId: f.offer.id,
      userId: f.alice.id,
      side: 'offer' as const,
      createdAt: now,
      expiresAt: now + 60,
    };
    await expect(
      db
        .insert(s.tradeReservations)
        .values({ ...reservation, instanceId: f.ap.id }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(s.tradeReservations)
        .values({ ...reservation, userId: f.bob.id }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(s.tradeReservations)
        .values({ ...reservation, side: 'proposal' }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(s.tradeReservations)
        .values({ ...reservation, expiresAt: now + 120 }),
    ).rejects.toThrow();
  });

  it('rejects malformed states and self-trades and keeps the two deadlines distinct', async () => {
    const f = await fixture();
    await expect(
      db.insert(s.trades).values({ ...f.offer, state: 'pending' }),
    ).rejects.toThrow();
    const pending = {
      ...f.offer,
      state: 'pending' as const,
      proposerId: f.bob.id,
      proposedInstanceId: f.b.id,
      proposedAt: now + 30,
      proposalExpiresAt: now + 150,
    };
    await expect(
      db.insert(s.trades).values({ ...pending, proposerId: f.alice.id }),
    ).rejects.toThrow();
    await expect(
      db.insert(s.trades).values({ ...pending, proposedAt: now + 60 }),
    ).rejects.toThrow();
    await expect(
      db.insert(s.trades).values({ ...pending, state: 'completed' }),
    ).rejects.toThrow();
    await db.insert(s.trades).values(pending);
    await db.insert(s.tradeReservations).values([
      {
        instanceId: f.a.id,
        tradeId: pending.id,
        userId: f.alice.id,
        side: 'offer',
        createdAt: now + 30,
        expiresAt: now + 150,
      },
      {
        instanceId: f.b.id,
        tradeId: pending.id,
        userId: f.bob.id,
        side: 'proposal',
        createdAt: now + 30,
        expiresAt: now + 150,
      },
    ]);
  });
});

// Storage proof only. The acceptance service (#14) must also assert participant,
// trade state, expiry, reservations and history inside the same D1 batch.
function guardedTransfer(
  f: Awaited<ReturnType<typeof fixture>>,
  secondVersion = 0,
) {
  const guardA = uid();
  const guardB = uid();
  const move = (
    id: string,
    oldOwner: string,
    newOwner: string,
    expectedVersion: number,
  ) =>
    env.DB.prepare(
      `
    UPDATE pokemon_instances SET owner_id = ?, is_protected = 1, version = version + 1, acquired_at = ?
    WHERE id = ? AND owner_id = ? AND is_protected = 0 AND version = ?
  `,
    ).bind(newOwner, now + 1, id, oldOwner, expectedVersion);
  return env.DB.batch([
    move(f.a.id, f.alice.id, f.bob.id, 0),
    env.DB.prepare(
      'INSERT INTO transaction_guards (id, ok) VALUES (?, changes() = 1)',
    ).bind(guardA),
    move(f.b.id, f.bob.id, f.alice.id, secondVersion),
    env.DB.prepare(
      'INSERT INTO transaction_guards (id, ok) VALUES (?, changes() = 1)',
    ).bind(guardB),
    env.DB.prepare('DELETE FROM transaction_guards WHERE id IN (?, ?)').bind(
      guardA,
      guardB,
    ),
  ]);
}

describe('D1 atomic precondition proof', () => {
  it('rolls back the first write when the second changes zero rows', async () => {
    const f = await fixture();
    await expect(guardedTransfer(f, 99)).rejects.toThrow();
    expect(
      await db
        .select()
        .from(s.pokemonInstances)
        .where(eq(s.pokemonInstances.id, f.a.id))
        .get(),
    ).toMatchObject({ ownerId: f.alice.id, version: 0, isProtected: false });
    expect(
      await db
        .select()
        .from(s.pokemonInstances)
        .where(eq(s.pokemonInstances.id, f.b.id))
        .get(),
    ).toMatchObject({ ownerId: f.bob.id, version: 0 });
    expect(await db.select().from(s.transactionGuards)).toEqual([]);
  });

  it('allows only one competing batch to transfer both instances', async () => {
    const f = await fixture();
    const attempts = await Promise.allSettled([
      guardedTransfer(f),
      guardedTransfer(f),
    ]);
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      await db
        .select()
        .from(s.pokemonInstances)
        .where(eq(s.pokemonInstances.id, f.a.id))
        .get(),
    ).toMatchObject({ ownerId: f.bob.id, version: 1, isProtected: true });
    expect(
      await db
        .select()
        .from(s.pokemonInstances)
        .where(eq(s.pokemonInstances.id, f.b.id))
        .get(),
    ).toMatchObject({ ownerId: f.alice.id, version: 1, isProtected: true });
    expect(await db.select().from(s.transactionGuards)).toEqual([]);
  });
});

const upload = (userId: string) => ({
  id: uid(),
  userId,
  idempotencyKey: uid(),
  fileHash: hash(),
  objectKey: uid(),
  sizeBytes: 1024,
  width: 512,
  height: 512,
  expectedProfileVersion: 0,
  createdAt: now,
  updatedAt: now,
});

describe('Avatar operations and cleanup', () => {
  it('enforces per-user idempotency and valid image metadata', async () => {
    const row = user();
    await db.insert(s.users).values(row);
    const first = upload(row.id);
    await db.insert(s.avatarUploads).values(first);
    await expect(
      db
        .insert(s.avatarUploads)
        .values({ ...upload(row.id), idempotencyKey: first.idempotencyKey }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(s.avatarUploads)
        .values({ ...upload(row.id), sizeBytes: 1048577 }),
    ).rejects.toThrow();
    await expect(
      db.insert(s.avatarUploads).values({ ...upload(row.id), width: 256 }),
    ).rejects.toThrow();
    await expect(
      db
        .update(s.avatarUploads)
        .set({ fileHash: hash() })
        .where(eq(s.avatarUploads.id, first.id)),
    ).rejects.toThrow();
  });

  it('only references an owned stored upload and prevents dangling profile references', async () => {
    const alice = user();
    const bob = user();
    await db.insert(s.users).values([alice, bob]);
    const image = upload(alice.id);
    await db.insert(s.avatarUploads).values(image);
    await expect(
      db
        .update(s.users)
        .set({ avatarObjectKey: image.objectKey })
        .where(eq(s.users.id, alice.id)),
    ).rejects.toThrow();
    await db
      .update(s.avatarUploads)
      .set({ state: 'stored' })
      .where(eq(s.avatarUploads.id, image.id));
    await expect(
      db
        .update(s.users)
        .set({ avatarObjectKey: image.objectKey })
        .where(eq(s.users.id, bob.id)),
    ).rejects.toThrow();
    await db
      .update(s.users)
      .set({ avatarObjectKey: image.objectKey })
      .where(eq(s.users.id, alice.id));
    await expect(
      db.delete(s.avatarUploads).where(eq(s.avatarUploads.id, image.id)),
    ).rejects.toThrow();
    await db
      .update(s.users)
      .set({ avatarObjectKey: null })
      .where(eq(s.users.id, alice.id));
    await db.delete(s.avatarUploads).where(eq(s.avatarUploads.id, image.id));
  });

  it('deduplicates active cleanup jobs and requires leases for processing', async () => {
    const row = user();
    await db.insert(s.users).values(row);
    const image = upload(row.id);
    await db.insert(s.avatarUploads).values(image);
    const job = {
      id: uid(),
      objectKey: image.objectKey,
      reason: 'abandoned' as const,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(s.mediaCleanupJobs).values(job);
    await expect(
      db.insert(s.mediaCleanupJobs).values({ ...job, id: uid() }),
    ).rejects.toThrow();
    await expect(
      db
        .update(s.mediaCleanupJobs)
        .set({ state: 'processing' })
        .where(eq(s.mediaCleanupJobs.id, job.id)),
    ).rejects.toThrow();
    await db
      .update(s.mediaCleanupJobs)
      .set({ state: 'processing', leaseExpiresAt: now + 60 })
      .where(eq(s.mediaCleanupJobs.id, job.id));
    await db
      .update(s.mediaCleanupJobs)
      .set({ state: 'completed', leaseExpiresAt: null })
      .where(eq(s.mediaCleanupJobs.id, job.id));
    await db.insert(s.mediaCleanupJobs).values({ ...job, id: uid() });
  });
});
