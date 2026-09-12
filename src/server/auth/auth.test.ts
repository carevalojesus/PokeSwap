import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { Hono } from 'hono';
import app from '../index';
import {
  type AuthEnv,
  requireSelfOrTeacher,
  requireSession,
} from './middleware';
import {
  authenticate,
  createSession,
  SESSION_COOKIE,
  tokenHash,
} from './session';
import { prepareTeacherInsert } from './teacher';
import { ageOnDate } from './profile';

const origin = 'https://pokeswap.example';
const allow = () => ({
  limit: vi.fn(async (input: { key: string }) => ({
    success: input.key.length > 0,
  })),
});
const bindings = () => ({
  DB: env.DB,
  AUTH_IP_LIMITER: allow(),
  AUTH_ACCOUNT_LIMITER: allow(),
});
const input = () => ({
  senatiId: crypto.randomUUID().replaceAll('-', ''),
  firstNames: 'Ana María',
  lastNames: "D'Ávila Pérez",
  birthDate: '2004-02-29',
  password: 'frase segura para la prueba',
});
function call(
  path: string,
  body?: unknown,
  cookie?: string,
  customBindings = bindings(),
  headers: Record<string, string> = {},
) {
  return app.request(
    `${origin}${path}`,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    customBindings,
  );
}
const cookieOf = (response: Response) =>
  response.headers.get('set-cookie')!.split(';')[0];
const tokenOf = (cookie: string) => cookie.slice(cookie.indexOf('=') + 1);
async function student() {
  const data = input();
  const response = await call('/api/auth/register', data);
  expect(response.status).toBe(201);
  const body = await response.json<{
    user: { id: string; trainerName: string; senatiId: string };
    initial: { instanceId: string; speciesId: number };
    session: { expiresAt: number };
  }>();
  return { data, body, cookie: cookieOf(response), response };
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, inject('migrations'));
});

describe('registration and cookie sessions', () => {
  it('sets a host-only secure cookie and stores only its hash', async () => {
    const account = await student();
    const header = account.response.headers.get('set-cookie')!;
    expect(header).toContain(`${SESSION_COOKIE}=`);
    for (const flag of [
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Path=/',
      'Max-Age=604800',
    ])
      expect(header).toContain(flag);
    expect(header).not.toContain('Domain=');
    const rawToken = tokenOf(account.cookie);
    const row = await env.DB.prepare('SELECT * FROM sessions WHERE user_id=?')
      .bind(account.body.user.id)
      .first();
    expect(row).toMatchObject({
      token_hash: await tokenHash(rawToken),
      revoked_at: null,
      expires_at: account.body.session.expiresAt,
    });
    expect(JSON.stringify(row)).not.toContain(rawToken);
    expect(JSON.stringify(account.body)).not.toContain(rawToken);
    expect(JSON.stringify(account.body)).not.toMatch(/password|token_hash/);
    const me = await call('/api/me', undefined, account.cookie);
    expect(me.status).toBe(200);
    expect(me.headers.get('cache-control')).toBe('no-store');
    expect(await me.json()).toEqual(account.body);
  });

  it('recovers the same profile and initial after losing a registration response', async () => {
    const account = await student();
    expect((await call('/api/auth/register', account.data)).status).toBe(409);
    const login = await call('/api/auth/login', {
      senatiId: ` ${account.data.senatiId.toLowerCase()} `,
      password: account.data.password,
    });
    expect(login.status).toBe(200);
    const recovered = await login.json<{ user: unknown; initial: unknown }>();
    expect(recovered.user).toEqual(account.body.user);
    expect(recovered.initial).toEqual(account.body.initial);
    expect(cookieOf(login)).not.toBe(account.cookie);
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS total FROM reward_grants WHERE user_id=?',
      )
        .bind(account.body.user.id)
        .first(),
    ).toEqual({ total: 1 });
  });

  it('rotates a presented session at login and prevents session fixation', async () => {
    const account = await student();
    const login = await call(
      '/api/auth/login',
      { senatiId: account.data.senatiId, password: account.data.password },
      account.cookie,
    );
    expect(login.status).toBe(200);
    const rotated = cookieOf(login);
    expect(rotated).not.toBe(account.cookie);
    expect((await call('/api/me', undefined, account.cookie)).status).toBe(401);
    expect((await call('/api/me', undefined, rotated)).status).toBe(200);
  });

  it('revokes logout and clears the cookie; repeating logout is safe', async () => {
    const account = await student();
    const response = await call('/api/auth/logout', {}, account.cookie);
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await call('/api/me', undefined, account.cookie)).status).toBe(401);
    expect((await call('/api/auth/logout', {}, account.cookie)).status).toBe(
      204,
    );
    expect((await call('/api/auth/logout', {})).status).toBe(204);
  });

  it('rejects absent, malformed, unknown, expired and revoked sessions', async () => {
    for (const cookie of [
      undefined,
      `${SESSION_COOKIE}=bad`,
      `${SESSION_COOKIE}=${'f'.repeat(64)}`,
    ]) {
      expect((await call('/api/me', undefined, cookie)).status).toBe(401);
    }
    const account = await student();
    const hash = await tokenHash(tokenOf(account.cookie));
    await env.DB.prepare(
      'UPDATE sessions SET created_at=1,expires_at=2 WHERE token_hash=?',
    )
      .bind(hash)
      .run();
    expect((await call('/api/me', undefined, account.cookie)).status).toBe(401);
    expect(await authenticate(env.DB, tokenOf(account.cookie), 2)).toBeNull();
    await env.DB.prepare(
      'UPDATE sessions SET expires_at=?,revoked_at=2 WHERE token_hash=?',
    )
      .bind(Math.floor(Date.now() / 1000) + 1000, hash)
      .run();
    expect((await call('/api/me', undefined, account.cookie)).status).toBe(401);
  });

  it('uses the same public error for unknown accounts and wrong passwords', async () => {
    const account = await student();
    const wrong = await call('/api/auth/login', {
      senatiId: account.data.senatiId,
      password: 'incorrect password',
    });
    const unknown = await call('/api/auth/login', {
      senatiId: crypto.randomUUID().slice(0, 20),
      password: 'incorrect password',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(wrong.headers.has('set-cookie')).toBe(false);
  });

  it('keeps a confirmed registration recoverable when session creation fails', async () => {
    const data = input();
    await env.DB.prepare(
      `CREATE TRIGGER fail_session_test BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'session_failure'); END`,
    ).run();
    try {
      const response = await call('/api/auth/register', data);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        code: 'SESSION_START_FAILED',
      });
      expect(response.headers.has('set-cookie')).toBe(false);
    } finally {
      await env.DB.prepare('DROP TRIGGER fail_session_test').run();
    }
    const login = await call('/api/auth/login', {
      senatiId: data.senatiId,
      password: data.password,
    });
    expect(login.status).toBe(200);
    const recovered = await login.json<{ initial: unknown }>();
    expect(recovered.initial).not.toBeNull();
  });

  it('does not mint a new session using a stale password hash or revoke the previous one on failure', async () => {
    const account = await student();
    await expect(
      createSession(
        env.DB,
        account.body.user.id,
        'stale-hash',
        tokenOf(account.cookie),
        Math.floor(Date.now() / 1000),
      ),
    ).rejects.toThrow();
    expect((await call('/api/me', undefined, account.cookie)).status).toBe(200);
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS total FROM transaction_guards',
      ).first(),
    ).toEqual({ total: 0 });
  });
});

describe('origin, body and attempt controls', () => {
  it.each(['https://evil.example', 'null', 'https://sub.pokeswap.example', ''])(
    'rejects mutation Origin %s before writing or hashing',
    async (Origin) => {
      const data = input();
      const limits = bindings();
      const response = await call(
        '/api/auth/register',
        data,
        undefined,
        limits,
        { Origin },
      );
      expect(response.status).toBe(403);
      expect(limits.AUTH_IP_LIMITER.limit).not.toHaveBeenCalled();
      expect(
        await env.DB.prepare('SELECT id FROM users WHERE senati_id=?')
          .bind(data.senatiId.toUpperCase())
          .first(),
      ).toBeNull();
    },
  );
  it('rejects a missing Origin, cross-site fetch metadata and form submissions', async () => {
    const noOrigin = await app.request(
      `${origin}/api/auth/logout`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
      bindings(),
    );
    expect(noOrigin.status).toBe(403);
    expect(
      (
        await call('/api/auth/logout', {}, undefined, bindings(), {
          'Sec-Fetch-Site': 'cross-site',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('/api/auth/login', {}, undefined, bindings(), {
          'Content-Type': 'text/plain',
        })
      ).status,
    ).toBe(415);
  });
  it('does not allow cross-origin logout to revoke a live session', async () => {
    const account = await student();
    expect(
      (
        await call('/api/auth/logout', {}, account.cookie, bindings(), {
          Origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403);
    expect((await call('/api/me', undefined, account.cookie)).status).toBe(200);
  });
  it('rejects oversized JSON and invalid JSON before any account write', async () => {
    const headers = { Origin: origin, 'Content-Type': 'application/json' };
    for (const [body, status] of [
      ['x'.repeat(8193), 413],
      ['{bad', 400],
    ] as const) {
      const response = await app.request(
        `${origin}/api/auth/register`,
        { method: 'POST', headers, body },
        bindings(),
      );
      expect(response.status).toBe(status);
    }
  });
  it('enforces account/IP limits and hashes their keys', async () => {
    const data = input();
    const limits = bindings();
    limits.AUTH_IP_LIMITER.limit.mockResolvedValueOnce({ success: false });
    const ip = await call(
      '/api/auth/login',
      { senatiId: data.senatiId, password: data.password },
      undefined,
      limits,
    );
    expect(ip.status).toBe(429);
    expect(ip.headers.get('retry-after')).toBe('60');
    expect(limits.AUTH_ACCOUNT_LIMITER.limit).not.toHaveBeenCalled();
    limits.AUTH_ACCOUNT_LIMITER.limit.mockResolvedValueOnce({ success: false });
    const account = await call('/api/auth/register', data, undefined, limits);
    expect(account.status).toBe(429);
    expect(limits.AUTH_ACCOUNT_LIMITER.limit).toHaveBeenCalledWith({
      key: `pokeswap:auth:account:${await tokenHash(data.senatiId.toUpperCase())}`,
    });
  });
  it('rejects public role, alias and initial overrides', async () => {
    for (const extra of [
      { role: 'teacher' },
      { trainerName: 'Admin' },
      { speciesId: 150 },
    ]) {
      expect(
        (await call('/api/auth/register', { ...input(), ...extra })).status,
      ).toBe(400);
    }
  });
});

describe('roles, ownership and operator provisioning', () => {
  it('allows private student profiles only to the teacher and isolates /me', async () => {
    const alice = await student();
    const bob = await student();
    expect(
      (
        await call(
          `/api/admin/users/${bob.body.user.id}`,
          undefined,
          alice.cookie,
        )
      ).status,
    ).toBe(403);
    const me = await call(
      `/api/me?id=${bob.body.user.id}`,
      undefined,
      alice.cookie,
    );
    expect((await me.json<{ user: { id: string } }>()).user.id).toBe(
      alice.body.user.id,
    );
    const teacherInput = input();
    const teacher = await prepareTeacherInsert(teacherInput);
    await env.DB.prepare(teacher.sql).run();
    const login = await call('/api/auth/login', {
      senatiId: teacherInput.senatiId,
      password: teacherInput.password,
    });
    expect(login.status).toBe(200);
    const teacherBody = await login.json<{
      user: { role: string };
      initial: unknown;
    }>();
    expect(teacherBody.user.role).toBe('teacher');
    expect(teacherBody.initial).toBeNull();
    const profile = await call(
      `/api/admin/users/${bob.body.user.id}`,
      undefined,
      cookieOf(login),
    );
    expect(profile.status).toBe(200);
    expect((await profile.json<{ user: { id: string } }>()).user.id).toBe(
      bob.body.user.id,
    );
    const missing = await call(
      `/api/admin/users/${crypto.randomUUID()}`,
      undefined,
      cookieOf(login),
    );
    expect(missing.status).toBe(404);
  });
  it('enforces the reusable owner guard for private resources', async () => {
    const account = await student();
    const guarded = new Hono<AuthEnv>();
    guarded.get('/private/:id', requireSession, requireSelfOrTeacher(), (c) =>
      c.json({ userId: c.req.param('id') }),
    );
    expect(
      (
        await guarded.request(
          `${origin}/private/${account.body.user.id}`,
          { headers: { Cookie: account.cookie } },
          bindings(),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await guarded.request(
          `${origin}/private/${crypto.randomUUID()}`,
          { headers: { Cookie: account.cookie } },
          bindings(),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await guarded.request(
          `${origin}/private/${account.body.user.id}`,
          {},
          bindings(),
        )
      ).status,
    ).toBe(401);
  });
  it('cannot promote or overwrite a student by provisioning the same ID', async () => {
    const account = await student();
    const teacher = await prepareTeacherInsert(account.data);
    await expect(env.DB.prepare(teacher.sql).run()).rejects.toThrow(
      'UNIQUE constraint',
    );
    expect(
      await env.DB.prepare('SELECT role FROM users WHERE id=?')
        .bind(account.body.user.id)
        .first(),
    ).toEqual({ role: 'student' });
  });
  it('reads the role from D1 instead of trusting cookie or request claims', async () => {
    const account = await student();
    expect(
      (
        await call(
          `/api/admin/users/${account.body.user.id}?role=teacher`,
          undefined,
          account.cookie,
        )
      ).status,
    ).toBe(403);
    await env.DB.prepare("UPDATE users SET role='teacher' WHERE id=?")
      .bind(account.body.user.id)
      .run();
    expect(
      (
        await call(
          `/api/admin/users/${account.body.user.id}`,
          undefined,
          account.cookie,
        )
      ).status,
    ).toBe(200);
    await env.DB.prepare("UPDATE users SET role='student' WHERE id=?")
      .bind(account.body.user.id)
      .run();
    expect(
      (
        await call(
          `/api/admin/users/${account.body.user.id}`,
          undefined,
          account.cookie,
        )
      ).status,
    ).toBe(403);
  });
  it('calculates age by calendar with March 1 for February 29 birthdays', () => {
    expect(ageOnDate('2004-02-29', '2025-02-28')).toBe(20);
    expect(ageOnDate('2004-02-29', '2025-03-01')).toBe(21);
    expect(ageOnDate('2004-02-29', '2024-02-29')).toBe(20);
  });
});

it('logout remains available when the IP authentication limit is exhausted', async () => {
  const account = await student();
  const limits = bindings();
  limits.AUTH_IP_LIMITER.limit.mockResolvedValue({ success: false });
  const response = await call('/api/auth/logout', {}, account.cookie, limits);
  expect(response.status).toBe(204);
  expect(limits.AUTH_IP_LIMITER.limit).not.toHaveBeenCalled();
});

it('logout affects only the presented session, not another device', async () => {
  const account = await student();
  const second = await call('/api/auth/login', {
    senatiId: account.data.senatiId,
    password: account.data.password,
  });
  const secondCookie = cookieOf(second);
  expect((await call('/api/auth/logout', {}, account.cookie)).status).toBe(204);
  expect(
    (await call('/api/auth/session', undefined, secondCookie)).status,
  ).toBe(200);
  expect(
    (await call('/api/auth/session', undefined, account.cookie)).status,
  ).toBe(401);
});

it('checks actual body bytes even with a misleading Content-Length', async () => {
  const response = await app.request(
    `${origin}/api/auth/login`,
    {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'Content-Length': '1',
      },
      body: 'x'.repeat(8193),
    },
    bindings(),
  );
  expect(response.status).toBe(413);
});

it('protects the entire private and admin namespaces, including future routes', async () => {
  const account = await student();
  expect((await call('/api/admin/future')).status).toBe(401);
  expect(
    (await call('/api/admin/future', undefined, account.cookie)).status,
  ).toBe(403);
  expect((await call('/api/me/future')).status).toBe(401);
});
