import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, expect, inject, it } from 'vitest';
import app from '../index';
import { getCollection } from './service';
import { createSession, SESSION_COOKIE } from '../auth/session';
import { collectionSchema } from '../../shared/schemas/collection';

const now = 1_800_000_000;
const uuid = () => crypto.randomUUID();
beforeAll(async () => {
  await applyD1Migrations(env.DB, inject('migrations'));
});
async function user(role = 'student') {
  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO users (id,senati_id,first_names,last_names,birth_date,trainer_name,trainer_name_key,trainer_name_version,password_hash,role,created_at,updated_at) VALUES (?,?,'Ana','Prueba','2000-01-01',?,?,1,'fixture',?,0,0)`,
  )
    .bind(id, id.replaceAll('-', '').toUpperCase(), id, id, role)
    .run();
  return id;
}
async function award(owner: string, species: number[]) {
  const teacher = await user('teacher');
  const instances: string[] = [];
  for (let offset = 0; offset < species.length; offset += 3) {
    const drop = uuid(),
      grant = uuid();
    await env.DB.prepare(
      'INSERT INTO poke_drops (id,creator_id,token_hash,created_at,expires_at) VALUES (?,?,?,0,?)',
    )
      .bind(drop, teacher, uuid().replaceAll('-', '').repeat(2), now + 1000)
      .run();
    await env.DB.prepare(
      "INSERT INTO reward_grants (id,user_id,kind,drop_id,draw_count,probabilities_version,created_at) VALUES (?,?,'drop',?,3,1,0)",
    )
      .bind(grant, owner, drop)
      .run();
    for (const [slot, speciesId] of species
      .slice(offset, offset + 3)
      .entries()) {
      const id = uuid();
      await env.DB.prepare(
        `INSERT INTO pokemon_instances (id,species_id,owner_id,grant_id,grant_slot,is_protected,created_at,acquired_at)
        VALUES (?,?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM pokemon_instances WHERE owner_id=? AND species_id=? AND is_protected=1) THEN 0 ELSE 1 END,0,0)`,
      )
        .bind(id, speciesId, owner, grant, slot, owner, speciesId)
        .run();
      instances.push(id);
    }
  }
  return instances;
}
async function reserve(owner: string, instance: string, expires = now + 60) {
  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO trades (id,offerer_id,offered_instance_id,token_hash,created_at,offer_expires_at) VALUES (?,?,?,?,?,?)`,
  )
    .bind(
      id,
      owner,
      instance,
      uuid().replaceAll('-', '').repeat(2),
      now,
      expires,
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO trade_reservations (instance_id,trade_id,user_id,side,created_at,expires_at) VALUES (?,?,?,'offer',?,?)`,
  )
    .bind(instance, id, owner, now, expires)
    .run();
  return id;
}
it('five Pikachu are five instances, one species, one protected and four available', async () => {
  const id = await user();
  const instances = await award(id, [25, 25, 25, 25, 25]);
  expect(new Set(instances).size).toBe(5);
  expect(await getCollection(env.DB, id, now)).toEqual({
    userId: id,
    goal: 150,
    obtained: 1,
    total: 5,
    reserved: 0,
    available: 4,
    nextRefreshAt: null,
    species: [
      { speciesId: 25, total: 5, protected: 1, reserved: 0, available: 4 },
    ],
  });
});
it('Mew duplicates do not alter the denominator or completion, including all 150 goal species', async () => {
  const id = await user();
  await award(id, [151, 151, 151]);
  expect(await getCollection(env.DB, id, now)).toMatchObject({
    goal: 150,
    obtained: 0,
    total: 3,
    available: 2,
  });
  await award(
    id,
    Array.from({ length: 150 }, (_, n) => n + 1),
  );
  const result = await getCollection(env.DB, id, now);
  expect(result).toMatchObject({
    goal: 150,
    obtained: 150,
    total: 153,
    available: 2,
  });
  expect(result.species).toHaveLength(151);
});
it('counts active reservations and makes expired ones logically available without needing cleanup', async () => {
  const id = await user();
  const instances = await award(id, [25, 25, 25, 25, 25]);
  await reserve(id, instances[1]);
  await reserve(id, instances[2], now + 120);
  expect(await getCollection(env.DB, id, now)).toMatchObject({
    reserved: 2,
    available: 2,
    nextRefreshAt: now + 60,
  });
  expect(await getCollection(env.DB, id, now + 60)).toMatchObject({
    reserved: 1,
    available: 3,
    nextRefreshAt: now + 120,
  });
  expect(await getCollection(env.DB, id, now + 120)).toMatchObject({
    reserved: 0,
    available: 4,
    nextRefreshAt: null,
  });
  expect(
    (
      await env.DB.prepare('SELECT * FROM trade_reservations WHERE user_id=?')
        .bind(id)
        .all()
    ).results,
  ).toHaveLength(2);
});
it('a closed trade no longer reserves an instance even before cleanup', async () => {
  const id = await user();
  const instances = await award(id, [25, 25]);
  const trade = await reserve(id, instances[1]);
  await env.DB.prepare(
    "UPDATE trades SET state='cancelled',closed_at=? WHERE id=?",
  )
    .bind(now + 1, trade)
    .run();
  expect(await getCollection(env.DB, id, now + 2)).toMatchObject({
    reserved: 0,
    available: 1,
    nextRefreshAt: null,
  });
});
it('uses proposal deadline after an offer moves to pending, including both sides', async () => {
  const a = await user(),
    b = await user();
  const ai = await award(a, [25, 25]),
    bi = await award(b, [1, 1]);
  const trade = await reserve(a, ai[1]);
  await env.DB.prepare(
    "UPDATE trades SET state='pending',proposer_id=?,proposed_instance_id=?,proposed_at=?,proposal_expires_at=? WHERE id=?",
  )
    .bind(b, bi[1], now + 1, now + 180, trade)
    .run();
  await env.DB.prepare(
    'UPDATE trade_reservations SET expires_at=? WHERE trade_id=?',
  )
    .bind(now + 180, trade)
    .run();
  await env.DB.prepare(
    "INSERT INTO trade_reservations (instance_id,trade_id,user_id,side,created_at,expires_at) VALUES (?,?,?,'proposal',?,?)",
  )
    .bind(bi[1], trade, b, now + 1, now + 180)
    .run();
  for (const id of [a, b]) {
    expect(await getCollection(env.DB, id, now + 70)).toMatchObject({
      reserved: 1,
      available: 0,
      nextRefreshAt: now + 180,
    });
    expect(await getCollection(env.DB, id, now + 180)).toMatchObject({
      reserved: 0,
      available: 1,
    });
  }
});
it('D1 protects the first instance from reservation, transfer and deletion', async () => {
  const a = await user(),
    b = await user();
  const [first] = await award(a, [151, 151]);
  await expect(reserve(a, first)).rejects.toThrow(
    'reservation_requires_owned_duplicate',
  );
  await expect(
    env.DB.prepare('UPDATE pokemon_instances SET owner_id=? WHERE id=?')
      .bind(b, first)
      .run(),
  ).rejects.toThrow('protected_instance_cannot_leave');
  await expect(
    env.DB.prepare('DELETE FROM pokemon_instances WHERE id=?')
      .bind(first)
      .run(),
  ).rejects.toThrow('protected_instance_cannot_be_deleted');
  expect(await getCollection(env.DB, a, now)).toMatchObject({
    total: 2,
    available: 1,
  });
});
it('authenticates and scopes reads to the student session; no private data or caching', async () => {
  const a = await user(),
    b = await user(),
    teacher = await user('teacher');
  await award(a, [25]);
  await award(b, [151, 151]);
  const read = async (id?: string, path = '/api/me/collection') => {
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
      `https://pokeswap.example${path}`,
      {
        headers: session
          ? { Cookie: `${SESSION_COOKIE}=${session.token}` }
          : {},
      },
      env,
    );
  };
  expect((await read()).status).toBe(401);
  expect((await read(teacher)).status).toBe(403);
  const response = await read(a, `/api/me/collection?userId=${b}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const body = await response.json();
  expect(body).toMatchObject({ userId: a, obtained: 1, total: 1 });
  expect(JSON.stringify(body)).not.toMatch(
    /password|senati|birth|trainer|instanceId|grantId/,
  );
  expect((await read(a, `/api/users/${b}/collection`)).status).toBe(404);
  expect(await (await read(b)).json()).toMatchObject({
    userId: b,
    obtained: 0,
    total: 2,
  });
});
it('empty collections are explicit and malformed/inconsistent contracts are rejected', async () => {
  const result = await getCollection(env.DB, await user(), now);
  expect(result).toMatchObject({ species: [], obtained: 0, total: 0 });
  expect(collectionSchema.safeParse({ ...result, obtained: 1 }).success).toBe(
    false,
  );
  expect(collectionSchema.safeParse({ ...result, goal: 151 }).success).toBe(
    false,
  );
  expect(
    collectionSchema.safeParse({ ...result, secret: 'unexpected' }).success,
  ).toBe(false);
});
