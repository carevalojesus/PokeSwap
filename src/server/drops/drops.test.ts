import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, expect, inject, it, vi } from 'vitest';
import app from '../index';
import { createSession, SESSION_COOKIE, tokenHash } from '../auth/session';
import {
  createDrop,
  cancelDrop,
  detail,
  previewDrop,
  redeemDrop,
  sharingCode,
} from './service';
import { getCollection } from '../collection/service';

const secret = 'ab'.repeat(32);
const origin = 'https://pokeswap.example';
const bindings = {
  ...env,
  DB: env.DB,
  DROPS_TOKEN_SECRET: secret,
  AUTH_ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
};
beforeAll(async () => {
  await applyD1Migrations(env.DB, inject('migrations'));
});
async function user(role = 'student') {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id,senati_id,first_names,last_names,birth_date,trainer_name,trainer_name_key,trainer_name_version,password_hash,role,created_at,updated_at) VALUES (?,?,'Ana','Prueba','2000-01-01',?,?,1,'fixture',?,0,0)`,
  )
    .bind(id, id.replaceAll('-', '').toUpperCase(), id, id, role)
    .run();
  return id;
}
async function fixture() {
  const teacher = await user('teacher'),
    student = await user();
  const created = await createDrop(env.DB, secret, teacher, {
    id: crypto.randomUUID(),
    minutes: 30,
  });
  return { teacher, student, ...created };
}
const pikachu = () => ({ speciesId: 25, probabilitiesVersion: 1 as const });
it('creation is idempotent, defaults to 30-minute semantics, recovers code and stores only its hash', async () => {
  const teacher = await user('teacher'),
    id = crypto.randomUUID();
  const results = await Promise.all([
    createDrop(env.DB, secret, teacher, { id, minutes: 30 }),
    createDrop(env.DB, secret, teacher, { id, minutes: 30 }),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0].drop.expiresAt - results[0].drop.createdAt).toBe(1800);
  expect(await detail(env.DB, secret, teacher, id)).toEqual(results[0]);
  expect(
    (
      await env.DB.prepare('SELECT token_hash FROM poke_drops WHERE id=?')
        .bind(id)
        .first()
    )?.token_hash,
  ).toBe(await tokenHash(results[0].code));
  await expect(
    createDrop(env.DB, secret, teacher, { id, minutes: 60 }),
  ).rejects.toMatchObject({ code: 'DROP_CONFLICT' });
  expect(await sharingCode('cd'.repeat(32), teacher, id)).not.toBe(
    results[0].code,
  );
});
it('consulting awards nothing and an initial plus a drop gives four instances with duplicates protected', async () => {
  const f = await fixture();
  const grant = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO reward_grants (id,user_id,kind,draw_count,probabilities_version,created_at) VALUES (?,?,'initial',1,1,0)",
  )
    .bind(grant, f.student)
    .run();
  await env.DB.prepare(
    'INSERT INTO pokemon_instances (id,species_id,owner_id,grant_id,grant_slot,is_protected,created_at,acquired_at) VALUES (?,25,?,?,0,1,0,0)',
  )
    .bind(crypto.randomUUID(), f.student, grant)
    .run();
  expect((await previewDrop(env.DB, f.student, f.code)).reward).toBeNull();
  expect((await getCollection(env.DB, f.student)).total).toBe(1);
  const reward = await redeemDrop(env.DB, f.student, f.code, pikachu);
  expect(reward.instances.map((i) => i.speciesId)).toEqual([25, 25, 25]);
  expect(await getCollection(env.DB, f.student)).toMatchObject({
    total: 4,
    obtained: 1,
    available: 3,
  });
  expect(
    (
      await env.DB.prepare('SELECT * FROM instance_events WHERE grant_id=?')
        .bind(reward.id)
        .all()
    ).results,
  ).toHaveLength(3);
});
it('two simultaneous redemptions commit one grant and recover identical three instances', async () => {
  const f = await fixture();
  const [a, b] = await Promise.all([
    redeemDrop(env.DB, f.student, f.code, pikachu),
    redeemDrop(env.DB, f.student, f.code, pikachu),
  ]);
  expect(a).toEqual(b);
  expect((await getCollection(env.DB, f.student)).total).toBe(3);
  expect(
    (
      await env.DB.prepare('SELECT * FROM reward_grants WHERE drop_id=?')
        .bind(f.drop.id)
        .all()
    ).results,
  ).toHaveLength(1);
});
it('different students each receive three, including Mew and Mewtwo from the common draw contract', async () => {
  const f = await fixture(),
    other = await user();
  let slot = 0;
  const draw = () => ({
    speciesId: [150, 151, 151][slot++],
    probabilitiesVersion: 1 as const,
  });
  const a = await redeemDrop(env.DB, f.student, f.code, draw);
  const b = await redeemDrop(env.DB, other, f.code, pikachu);
  expect(a.instances.map((i) => i.speciesId)).toEqual([150, 151, 151]);
  expect(b.userId).toBe(other);
  expect(await getCollection(env.DB, f.student)).toMatchObject({
    total: 3,
    obtained: 1,
    available: 1,
    goal: 150,
  });
  expect(
    (await detail(env.DB, secret, f.teacher, f.drop.id)).drop.redemptions,
  ).toBe(2);
});
it('recovers a committed batch after its response is lost, without rerolling on subsequent reads', async () => {
  const f = await fixture();
  const batch = env.DB.batch.bind(env.DB);
  const uncertain = Object.create(env.DB) as D1Database;
  uncertain.batch = async (statements) => {
    await batch(statements);
    throw Error('response_lost');
  };
  const saved = await redeemDrop(uncertain, f.student, f.code, pikachu);
  const draw = vi.fn(pikachu);
  expect(await redeemDrop(env.DB, f.student, f.code, draw)).toEqual(saved);
  expect(draw).not.toHaveBeenCalled();
  expect((await previewDrop(env.DB, f.student, f.code)).reward).toEqual(saved);
});
it('a failure in any slot rolls back grants, instances and history', async () => {
  const f = await fixture();
  let slot = 0;
  await expect(
    redeemDrop(env.DB, f.student, f.code, () => ({
      speciesId: ++slot === 3 ? 999 : 25,
      probabilitiesVersion: 1,
    })),
  ).rejects.toThrow();
  expect((await previewDrop(env.DB, f.student, f.code)).reward).toBeNull();
  expect((await getCollection(env.DB, f.student)).total).toBe(0);
  expect(
    (
      await env.DB.prepare('SELECT * FROM instance_events WHERE to_user_id=?')
        .bind(f.student)
        .all()
    ).results,
  ).toHaveLength(0);
});
it('cancellation blocks new awards but never revokes or hides an already committed reward', async () => {
  const f = await fixture(),
    other = await user();
  const saved = await redeemDrop(env.DB, f.student, f.code, pikachu);
  const first = await cancelDrop(env.DB, f.teacher, f.drop.id);
  expect(await cancelDrop(env.DB, f.teacher, f.drop.id)).toEqual(first);
  expect(first.drop.state).toBe('cancelled');
  expect(await redeemDrop(env.DB, f.student, f.code, pikachu)).toEqual(saved);
  await expect(
    redeemDrop(env.DB, other, f.code, pikachu),
  ).rejects.toMatchObject({ code: 'DROP_INACTIVE' });
});
it('checks cancellation inside the batch even when it occurs after preflight', async () => {
  const f = await fixture();
  const batch = env.DB.batch.bind(env.DB);
  const race = Object.create(env.DB) as D1Database;
  race.batch = async (statements) => {
    await cancelDrop(env.DB, f.teacher, f.drop.id);
    return batch(statements);
  };
  await expect(
    redeemDrop(race, f.student, f.code, pikachu),
  ).rejects.toMatchObject({ code: 'DROP_INACTIVE' });
  expect((await getCollection(env.DB, f.student)).total).toBe(0);
});
it('checks expiration at the write, while expired committed rewards remain recoverable', async () => {
  const f = await fixture(),
    other = await user();
  const saved = await redeemDrop(env.DB, f.student, f.code, pikachu);
  await env.DB.prepare(
    'UPDATE poke_drops SET created_at=0,expires_at=1 WHERE id=?',
  )
    .bind(f.drop.id)
    .run();
  expect((await previewDrop(env.DB, other, f.code)).drop.state).toBe('expired');
  await expect(
    redeemDrop(env.DB, other, f.code, pikachu),
  ).rejects.toMatchObject({ code: 'DROP_INACTIVE' });
  expect(await redeemDrop(env.DB, f.student, f.code, pikachu)).toEqual(saved);
});
it('enforces HTTP roles, ownership, origin, bounded input and no-store without leaking codes in lists', async () => {
  const f = await fixture(),
    otherTeacher = await user('teacher');
  async function request(
    id: string | undefined,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const session = id
      ? await createSession(
          env.DB,
          id,
          'fixture',
          undefined,
          Math.floor(Date.now() / 1000),
        )
      : null;
    return app.request(
      origin + path,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          ...(session ? { Cookie: `${SESSION_COOKIE}=${session.token}` } : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      bindings,
    );
  }
  expect((await request(undefined, '/api/admin/drops')).status).toBe(401);
  expect((await request(f.student, '/api/admin/drops')).status).toBe(403);
  expect(
    (await request(otherTeacher, `/api/admin/drops/${f.drop.id}`)).status,
  ).toBe(404);
  expect(
    (await request(f.teacher, '/api/drops/redeem', { code: f.code })).status,
  ).toBe(403);
  expect(
    (
      await request(
        f.student,
        '/api/drops/redeem',
        { code: f.code },
        { Origin: 'https://evil.example' },
      )
    ).status,
  ).toBe(403);
  expect(
    (await request(f.student, '/api/drops/redeem', { code: 'bad' })).status,
  ).toBe(400);
  expect(
    (
      await request(f.teacher, '/api/admin/drops', {
        id: crypto.randomUUID(),
        minutes: 0,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(f.teacher, '/api/admin/drops', {
        id: crypto.randomUUID(),
        minutes: 1441,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await request(f.teacher, '/api/admin/drops', {
        id: crypto.randomUUID(),
        extra: 'x'.repeat(9000),
      })
    ).status,
  ).toBe(400);
  const created = await request(f.teacher, '/api/admin/drops', {
    id: crypto.randomUUID(),
  });
  expect(created.status).toBe(200);
  const list = await request(f.teacher, '/api/admin/drops');
  expect(list.headers.get('Cache-Control')).toBe('no-store');
  expect(await list.text()).not.toMatch(
    new RegExp(`${f.code}|tokenHash|creatorId|password`),
  );
  const preview = await request(f.student, '/api/drops/preview', {
    code: f.code,
  });
  expect(preview.status).toBe(200);
  expect((await getCollection(env.DB, f.student)).total).toBe(0);
  expect(
    (await request(f.student, '/api/drops/redeem', { code: f.code })).status,
  ).toBe(200);
});
