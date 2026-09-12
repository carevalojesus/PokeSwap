import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../auth/password';
import { drawPokemon } from '../game/draw';
import { generateTrainerName, trainerNameKey } from './trainer-name';
import {
  createRegistrationService,
  RegistrationConflict,
  TrainerNameUnavailable,
} from './register';

const now = () => new Date('2026-09-11T18:00:00Z');
const payload = () => ({
  senatiId: crypto.randomUUID().replaceAll('-', ''),
  firstNames: 'Ana María',
  lastNames: 'Arévalo Pérez',
  birthDate: '2004-02-29',
  password: 'frase privada para pruebas',
});
const alias = (name: string) => ({
  name,
  key: trainerNameKey(name),
  version: 1,
});
const dependencies = () => ({
  hashPassword,
  drawPokemon,
  generateTrainerName,
  now,
});
const query = (sql: string, ...args: (string | number)[]) =>
  env.DB.prepare(sql)
    .bind(...args)
    .first<Record<string, unknown>>();

beforeAll(async () => {
  await applyD1Migrations(env.DB, inject('migrations'));
});

describe('atomic student registration', () => {
  it('persists one normalized student, protected initial and issuance event', async () => {
    const data = {
      ...payload(),
      senatiId: `  000-${crypto.randomUUID().slice(0, 8)} `,
      firstNames: ' Ana   Mari\u0301a ',
    };
    const deps = dependencies();
    deps.drawPokemon = () => ({ speciesId: 151, probabilitiesVersion: 1 });
    const result = await createRegistrationService(env.DB, deps)(data);
    const user = await query('SELECT * FROM users WHERE id = ?', result.userId);
    expect(user).toMatchObject({
      senati_id: data.senatiId.trim().toUpperCase(),
      first_names: 'Ana María',
      role: 'student',
      trainer_name: result.trainerName,
      trainer_name_version: 1,
      birth_date: '2004-02-29',
      avatar_object_key: null,
    });
    expect(
      await verifyPassword(data.password, user!.password_hash as string),
    ).toBe(true);
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('birthDate');
    expect(
      await query(
        'SELECT * FROM reward_grants WHERE user_id = ?',
        result.userId,
      ),
    ).toMatchObject({
      kind: 'initial',
      draw_count: 1,
      probabilities_version: 1,
    });
    expect(
      await query(
        'SELECT * FROM pokemon_instances WHERE id = ?',
        result.initial.instanceId,
      ),
    ).toMatchObject({
      owner_id: result.userId,
      species_id: 151,
      grant_slot: 0,
      is_protected: 1,
      version: 0,
    });
    expect(
      await query(
        'SELECT * FROM instance_events WHERE instance_id = ?',
        result.initial.instanceId,
      ),
    ).toMatchObject({
      kind: 'issued',
      to_user_id: result.userId,
      instance_version: 0,
    });
  });

  it('settles concurrent registrations for the same normalized ID with exactly one result', async () => {
    const data = payload();
    // Barrier ensures both preflight reads see no account before either batch.
    let entered = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = dependencies();
    const realHash = await hashPassword(data.password);
    deps.hashPassword = async () => {
      if (++entered === 2) release();
      await gate;
      return realHash;
    };
    const register = createRegistrationService(env.DB, deps);
    const results = await Promise.allSettled([
      register(data),
      register({ ...data, senatiId: ` ${data.senatiId.toUpperCase()} ` }),
    ]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    );
    const rejected = results.find(
      (item) => item.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(RegistrationConflict);
    const row = await query(
      `SELECT u.id, (SELECT count(*) FROM reward_grants WHERE user_id=u.id) AS grants,
      (SELECT count(*) FROM pokemon_instances WHERE owner_id=u.id) AS instances,
      (SELECT count(*) FROM instance_events WHERE to_user_id=u.id) AS events
      FROM users u WHERE senati_id=?`,
      data.senatiId.toUpperCase(),
    );
    expect(row).toMatchObject({ grants: 1, instances: 1, events: 1 });
  });

  it('never recovers or modifies an existing account through registration, even with the correct password', async () => {
    const data = payload();
    const register = createRegistrationService(env.DB, dependencies());
    const original = await register(data);
    const before = await query(
      'SELECT * FROM users WHERE id=?',
      original.userId,
    );
    for (const password of [data.password, 'a different valid password']) {
      await expect(
        register({ ...data, firstNames: 'Changed', password }),
      ).rejects.toBeInstanceOf(RegistrationConflict);
    }
    expect(
      await query('SELECT * FROM users WHERE id=?', original.userId),
    ).toEqual(before);
    expect(
      await query(
        'SELECT count(*) AS total FROM pokemon_instances WHERE owner_id=?',
        original.userId,
      ),
    ).toEqual({ total: 1 });
  });

  it('retries only alias collisions while keeping the same hash and draw', async () => {
    const name = alias(`Kairo del Alba · ${crypto.randomUUID()}`);
    const occupied = dependencies();
    occupied.generateTrainerName = () => name;
    await createRegistrationService(env.DB, occupied)(payload());
    const deps = dependencies();
    deps.hashPassword = vi.fn(hashPassword);
    deps.drawPokemon = vi.fn(() => ({
      speciesId: 150,
      probabilitiesVersion: 1 as const,
    }));
    deps.generateTrainerName = vi
      .fn()
      .mockReturnValueOnce(name)
      .mockImplementation(generateTrainerName);
    const result = await createRegistrationService(env.DB, deps)(payload());
    expect(result.trainerName).not.toBe(name.name);
    expect(result.initial.speciesId).toBe(150);
    expect(deps.generateTrainerName).toHaveBeenCalledTimes(2);
    expect(deps.hashPassword).toHaveBeenCalledTimes(1);
    expect(deps.drawPokemon).toHaveBeenCalledTimes(1);
  });

  it('stops after five alias collisions without leaving a partial account', async () => {
    const deps = dependencies();
    deps.generateTrainerName = vi.fn(() => alias(`Kairo · fixed-${fixedId}`));
    const register = createRegistrationService(env.DB, deps);
    await register(payload());
    vi.mocked(deps.generateTrainerName).mockClear();
    const data = payload();
    await expect(register(data)).rejects.toBeInstanceOf(TrainerNameUnavailable);
    expect(deps.generateTrainerName).toHaveBeenCalledTimes(5);
    expect(
      await query(
        'SELECT id FROM users WHERE senati_id=?',
        data.senatiId.toUpperCase(),
      ),
    ).toBeNull();
  });

  it('rolls back account and grant if the initial species is invalid', async () => {
    const data = payload();
    const deps = dependencies();
    deps.drawPokemon = () => ({ speciesId: 999, probabilitiesVersion: 1 });
    await expect(
      createRegistrationService(env.DB, deps)(data),
    ).rejects.toThrow();
    expect(
      await query(
        'SELECT id FROM users WHERE senati_id=?',
        data.senatiId.toUpperCase(),
      ),
    ).toBeNull();
    expect(
      (await env.DB.prepare('PRAGMA foreign_key_check').all()).results,
    ).toEqual([]);
  });

  it('rolls back all four writes when the last history insert fails', async () => {
    await env.DB.prepare(
      `CREATE TRIGGER reject_test_history BEFORE INSERT ON instance_events
      BEGIN SELECT RAISE(ABORT, 'test_history_failure'); END`,
    ).run();
    const data = payload();
    const before = await query(
      'SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM reward_grants) AS grants, (SELECT count(*) FROM pokemon_instances) AS instances',
    );
    try {
      await expect(
        createRegistrationService(env.DB, dependencies())(data),
      ).rejects.toThrow('test_history_failure');
      expect(
        await query(
          'SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM reward_grants) AS grants, (SELECT count(*) FROM pokemon_instances) AS instances',
        ),
      ).toEqual(before);
    } finally {
      await env.DB.prepare('DROP TRIGGER reject_test_history').run();
    }
  });

  it('leaves no account when hashing fails and rejects injected permissions before hashing', async () => {
    const data = payload();
    const deps = dependencies();
    deps.hashPassword = vi.fn(async () => {
      throw new Error('hash unavailable');
    });
    const register = createRegistrationService(env.DB, deps);
    await expect(register({ ...data, role: 'teacher' })).rejects.toThrow(
      'campos no admitidos',
    );
    expect(deps.hashPassword).not.toHaveBeenCalled();
    await expect(register(data)).rejects.toThrow('hash unavailable');
    expect(
      await query(
        'SELECT id FROM users WHERE senati_id=?',
        data.senatiId.toUpperCase(),
      ),
    ).toBeNull();
  });
});
const fixedId = crypto.randomUUID();
