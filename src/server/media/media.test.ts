import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, expect, inject, it } from 'vitest';
import app from '../index';
import fixtures from './fixtures.json';
import { createSession, SESSION_COOKIE } from '../auth/session';
import { getPrivateProfile } from '../auth/profile';
import {
  putAvatar,
  deleteAvatar,
  queueCleanup,
  type MediaEnv,
} from './service';
import { reconcileMedia } from './cleanup';
import { validateWebp } from './webp';
const bytes = (i = 0) =>
  Uint8Array.from(atob(fixtures[i]), (c) => c.charCodeAt(0)).buffer;
const origin = 'https://pokeswap.example';
const bindings = {
  ...env,
  AUTH_IP_LIMITER: { limit: async () => ({ success: true }) },
  AUTH_ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
};
beforeAll(async () => {
  await applyD1Migrations(env.DB, inject('migrations'));
});
async function user() {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users(id,senati_id,first_names,last_names,birth_date,trainer_name,trainer_name_key,trainer_name_version,password_hash,role,created_at,updated_at) VALUES (?,?,'Prueba','Foto','2000-01-01',?,?,1,'fixture','teacher',0,0)`,
  )
    .bind(id, id.replaceAll('-', '').toUpperCase(), id, id)
    .run();
  const s = await createSession(
    env.DB,
    id,
    'fixture',
    undefined,
    Math.floor(Date.now() / 1000),
  );
  return { id, cookie: `${SESSION_COOKIE}=${s.token}` };
}
async function keyOf(id: string) {
  return (await env.DB.prepare(
    'SELECT avatar_object_key AS key FROM users WHERE id=?',
  )
    .bind(id)
    .first<{ key: string | null }>())!.key;
}
function r2Override(
  method: 'put' | 'delete',
  fn: () => Promise<never>,
): MediaEnv {
  return {
    DB: env.DB,
    AVATARS: new Proxy(env.AVATARS, {
      get(target, key) {
        if (key === method) return fn;
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
}
it('decodes real WebP and rejects fake, truncated, wrong dimensions, metadata and oversized payloads', async () => {
  await validateWebp(bytes());
  for (const input of [
    new ArrayBuffer(0),
    new TextEncoder().encode('<svg/>').buffer,
    bytes().slice(0, 35),
    new ArrayBuffer(1048577),
  ])
    await expect(validateWebp(input)).rejects.toThrow();
  const wrong = bytes();
  new Uint8Array(wrong)[24] = 0;
  await expect(validateWebp(wrong)).rejects.toThrow();
  const tail = new Uint8Array(bytes().byteLength + 8);
  tail.set(new Uint8Array(bytes()));
  tail.set(new TextEncoder().encode('EXIF'), bytes().byteLength);
  new DataView(tail.buffer).setUint32(4, tail.length - 8, true);
  await expect(validateWebp(tail.buffer)).rejects.toThrow();
});
it('persists once, recovers the same idempotency key and never reattaches a replaced image', async () => {
  const a = await user(),
    key = crypto.randomUUID();
  await putAvatar(env, a.id, key, 0, bytes());
  const old = await keyOf(a.id);
  expect(await env.AVATARS.head(old!)).not.toBeNull();
  await putAvatar(env, a.id, key, 0, bytes());
  expect((await getPrivateProfile(env.DB, a.id))!.user.profileVersion).toBe(1);
  await expect(putAvatar(env, a.id, key, 0, bytes(1))).rejects.toMatchObject({
    code: 'IDEMPOTENCY_CONFLICT',
  });
  await putAvatar(env, a.id, crypto.randomUUID(), 1, bytes(1));
  const current = await keyOf(a.id);
  expect(current).not.toBe(old);
  await putAvatar(env, a.id, key, 0, bytes());
  expect(await keyOf(a.id)).toBe(current);
  await reconcileMedia(env);
  expect(await env.AVATARS.head(old!)).toBeNull();
  expect(await env.AVATARS.head(current!)).not.toBeNull();
});
it('concurrent distinct uploads commit one, and cleanup never removes the winner', async () => {
  const a = await user();
  const results = await Promise.allSettled([
    putAvatar(env, a.id, crypto.randomUUID(), 0, bytes()),
    putAvatar(env, a.id, crypto.randomUUID(), 0, bytes(1)),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await getPrivateProfile(env.DB, a.id))!.user.profileVersion).toBe(1);
  await reconcileMedia(env);
  expect(await env.AVATARS.head((await keyOf(a.id))!)).not.toBeNull();
});
it('R2 failure preserves the prior profile and abandoned attempts are retired', async () => {
  const a = await user();
  await putAvatar(env, a.id, crypto.randomUUID(), 0, bytes());
  const old = await keyOf(a.id);
  await expect(
    putAvatar(
      r2Override('put', async () => {
        throw Error('injected');
      }),
      a.id,
      crypto.randomUUID(),
      1,
      bytes(1),
      1,
    ),
  ).rejects.toThrow();
  expect(await keyOf(a.id)).toBe(old);
  await reconcileMedia(env);
  expect(await env.AVATARS.head(old!)).not.toBeNull();
  expect(
    (await env.DB.prepare(
      "SELECT count(*) AS n FROM avatar_uploads WHERE user_id=? AND state='pending'",
    )
      .bind(a.id)
      .first<{ n: number }>())!.n,
  ).toBe(0);
});
it('a D1 failure after storing is recoverable with the original operation', async () => {
  const a = await user(),
    key = crypto.randomUUID();
  let fail = true;
  const db = new Proxy(env.DB, {
    get(target, k) {
      if (k === 'batch')
        return async (...args: Parameters<D1Database['batch']>) => {
          if (fail) {
            fail = false;
            throw Error('injected');
          }
          return target.batch(...args);
        };
      const value = Reflect.get(target, k);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await expect(
    putAvatar({ DB: db, AVATARS: env.AVATARS }, a.id, key, 0, bytes()),
  ).rejects.toThrow();
  expect(await keyOf(a.id)).toBeNull();
  await putAvatar(env, a.id, key, 0, bytes());
  expect(await keyOf(a.id)).not.toBeNull();
  expect((await getPrivateProfile(env.DB, a.id))!.user.profileVersion).toBe(1);
});
it('delete detaches first; failed object deletion is queued and retried', async () => {
  const a = await user();
  await putAvatar(env, a.id, crypto.randomUUID(), 0, bytes());
  const old = (await keyOf(a.id))!;
  await deleteAvatar(env, a.id, 1);
  expect(await keyOf(a.id)).toBeNull();
  await reconcileMedia(
    r2Override('delete', async () => {
      throw Error('injected');
    }),
  );
  expect(await env.AVATARS.head(old)).not.toBeNull();
  await reconcileMedia(env, Math.floor(Date.now() / 1000) + 901);
  expect(await env.AVATARS.head(old)).toBeNull();
});
it('protects referenced objects and active uploads even with an incorrect cleanup job', async () => {
  const a = await user();
  await putAvatar(env, a.id, crypto.randomUUID(), 0, bytes());
  const key = (await keyOf(a.id))!;
  await queueCleanup(env.DB, key, 'failed', 0).run();
  await reconcileMedia(env);
  expect(await env.AVATARS.head(key)).not.toBeNull();
});
it('a late R2 write after abandoned cleanup is found by the bucket sweep', async () => {
  const a = await user(),
    id = crypto.randomUUID();
  await expect(
    putAvatar(
      r2Override('put', async () => {
        throw Error('injected');
      }),
      a.id,
      id,
      0,
      bytes(),
      1,
    ),
  ).rejects.toThrow();
  await reconcileMedia(env);
  const row = await env.DB.prepare(
    'SELECT object_key AS key FROM avatar_uploads WHERE user_id=?',
  )
    .bind(a.id)
    .first<{ key: string }>();
  await env.AVATARS.put(row!.key, bytes());
  await reconcileMedia(env, Math.floor(Date.now() / 1000) + 7200);
  expect(await env.AVATARS.head(row!.key)).toBeNull();
});
it('serves photos to authenticated peers, revalidates caches, and denies unauthenticated reads and other-owner writes', async () => {
  const a = await user(),
    b = await user();
  const call = (
    path: string,
    method = 'GET',
    cookie = a.cookie,
    body?: ArrayBuffer,
  ) =>
    app.request(
      origin + path,
      {
        method,
        headers: {
          Cookie: cookie,
          Origin: origin,
          'Content-Type': 'image/webp',
          'X-Profile-Version': '0',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body,
      },
      bindings,
    );
  expect((await call('/api/me/avatar', 'PUT', a.cookie, bytes())).status).toBe(
    200,
  );
  const photo = await call(`/api/users/${a.id}/avatar`, 'GET', b.cookie);
  expect(photo.status).toBe(200);
  expect(photo.headers.get('cache-control')).toBe('private, no-cache');
  expect(await photo.arrayBuffer()).toEqual(bytes());
  const etag = photo.headers.get('etag')!;
  expect(
    (
      await app.request(
        `${origin}/api/users/${a.id}/avatar`,
        { headers: { Cookie: b.cookie, 'If-None-Match': etag } },
        bindings,
      )
    ).status,
  ).toBe(304);
  expect((await call(`/api/users/${a.id}/avatar`, 'GET', '')).status).toBe(401);
  expect(
    (await call(`/api/users/${a.id}/avatar`, 'PUT', b.cookie, bytes())).status,
  ).toBe(404);
  expect((await call('/api/me/avatar', 'PUT', '', bytes())).status).toBe(401);
  expect(
    (await call(`/api/users/${b.id}/avatar`, 'GET', b.cookie)).headers.get(
      'content-type',
    ),
  ).toBe('image/svg+xml');
});

it('simultaneous replays share one operation and pending storage is recoverable', async () => {
  const a = await user(),
    key = crypto.randomUUID();
  const results = await Promise.allSettled([
    putAvatar(env, a.id, key, 0, bytes()),
    putAvatar(env, a.id, key, 0, bytes()),
  ]);
  expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
  await putAvatar(env, a.id, key, 0, bytes());
  expect(
    (await env.DB.prepare(
      'SELECT count(*) AS n FROM avatar_uploads WHERE user_id=?',
    )
      .bind(a.id)
      .first<{ n: number }>())!.n,
  ).toBe(1);
  expect((await getPrivateProfile(env.DB, a.id))!.user.profileVersion).toBe(1);
});
it('rejects animation flags, frame corruption and origin changes', async () => {
  const animated = bytes();
  new Uint8Array(animated)[20] |= 2;
  await expect(validateWebp(animated)).rejects.toThrow();
  const corrupt = bytes();
  new Uint8Array(corrupt).fill(0, 510);
  await expect(validateWebp(corrupt)).rejects.toThrow();
  const a = await user();
  const result = await app.request(
    origin + '/api/me/avatar',
    {
      method: 'PUT',
      headers: {
        Cookie: a.cookie,
        Origin: 'https://other.example',
        'Content-Type': 'image/webp',
        'X-Profile-Version': '0',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: bytes(),
    },
    bindings,
  );
  expect(result.status).toBe(403);
});
it('a cleanup job cannot delete the object while its upload is still active', async () => {
  const a = await user();
  let release: () => void = () => {},
    entered: () => void = () => {};
  const wait = new Promise<void>((r) => {
      release = r;
    }),
    ready = new Promise<void>((r) => {
      entered = r;
    });
  const bucket = new Proxy(env.AVATARS, {
    get(target, k) {
      if (k === 'put')
        return async (...args: Parameters<R2Bucket['put']>) => {
          const result = await target.put(...args);
          entered();
          await wait;
          return result;
        };
      const v = Reflect.get(target, k);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  const pending = putAvatar(
    { DB: env.DB, AVATARS: bucket },
    a.id,
    crypto.randomUUID(),
    0,
    bytes(),
  );
  await ready;
  const row = await env.DB.prepare(
    'SELECT object_key AS key FROM avatar_uploads WHERE user_id=?',
  )
    .bind(a.id)
    .first<{ key: string }>();
  try {
    await queueCleanup(env.DB, row!.key, 'abandoned', 0).run();
    await reconcileMedia(env);
    expect(await env.AVATARS.head(row!.key)).not.toBeNull();
  } finally {
    release();
    await pending;
  }
  expect(await keyOf(a.id)).toBe(row!.key);
});
