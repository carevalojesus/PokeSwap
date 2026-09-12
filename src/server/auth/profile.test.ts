import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, expect, inject, it } from 'vitest';
import app from '../index';
import { ageOnDate, getPrivateProfile } from './profile';
import { createSession, SESSION_COOKIE } from './session';
import { limaDate } from '../../shared/schemas/registration';

const origin = 'https://pokeswap.example';
const bindings = {
  DB: env.DB,
  AUTH_IP_LIMITER: { limit: async () => ({ success: true }) },
  AUTH_ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
};
beforeAll(async () => {
  await applyD1Migrations(env.DB, inject('migrations'));
});
async function fixture(role = 'student') {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id,senati_id,first_names,last_names,birth_date,trainer_name,trainer_name_key,trainer_name_version,password_hash,role,created_at,updated_at)
    VALUES (?,?,'Ana','Prueba','2000-02-29',?,?,1,'test-fixture',?,0,0)`,
  )
    .bind(id, id.replaceAll('-', '').toUpperCase(), id, id, role)
    .run();
  const session = await createSession(
    env.DB,
    id,
    'test-fixture',
    undefined,
    Math.floor(Date.now() / 1000),
  );
  return { id, cookie: `${SESSION_COOKIE}=${session.token}` };
}
const update = {
  firstNames: ' María   José ',
  lastNames: " D'Ávila ",
  birthDate: '2001-09-11',
  profileVersion: 0,
};
function patch(
  cookie: string,
  body: unknown = update,
  headers: Record<string, string> = {},
) {
  return app.request(
    `${origin}/api/me/profile`,
    {
      method: 'PATCH',
      headers: {
        Cookie: cookie,
        Origin: origin,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    },
    bindings,
  );
}
it.each([
  ['2000-09-11', '2026-09-10', 25],
  ['2000-09-11', '2026-09-11', 26],
  ['2000-12-31', '2026-12-30', 25],
  ['2000-12-31', '2026-12-31', 26],
  ['2000-12-31', '2027-01-01', 26],
  ['2000-02-29', '2025-02-28', 24],
  ['2000-02-29', '2025-03-01', 25],
  ['2000-02-29', '2024-02-28', 23],
  ['2000-02-29', '2024-02-29', 24],
])('age %s on %s is %i', (birth, today, age) => {
  expect(ageOnDate(birth, today)).toBe(age);
});
it('uses the Lima day on both sides of midnight when reading D1', async () => {
  const user = await fixture();
  const before = new Date('2025-03-01T04:59:59Z');
  const after = new Date('2025-03-01T05:00:00Z');
  expect(limaDate(before)).toBe('2025-02-28');
  expect((await getPrivateProfile(env.DB, user.id, before))?.user.age).toBe(24);
  expect((await getPrivateProfile(env.DB, user.id, after))?.user.age).toBe(25);
});
it('normalizes personal details, increments version and preserves identity and credentials', async () => {
  const user = await fixture();
  const before = await env.DB.prepare('SELECT * FROM users WHERE id=?')
    .bind(user.id)
    .first();
  const response = await patch(user.cookie);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const result = await response.json<{ user: Record<string, unknown> }>();
  expect(result.user).toMatchObject({
    id: user.id,
    firstNames: 'María José',
    lastNames: "D'Ávila",
    birthDate: '2001-09-11',
    profileVersion: 1,
  });
  expect(JSON.stringify(result)).not.toMatch(/password|token_hash/);
  const after = await env.DB.prepare('SELECT * FROM users WHERE id=?')
    .bind(user.id)
    .first();
  for (const key of [
    'senati_id',
    'trainer_name',
    'trainer_name_key',
    'password_hash',
    'role',
    'created_at',
  ])
    expect(after![key]).toEqual(before![key]);
  expect((await getPrivateProfile(env.DB, user.id))?.user.firstNames).toBe(
    'María José',
  );
});
it('two simultaneous updates with the same version commit exactly one and recover via GET', async () => {
  const user = await fixture();
  const responses = await Promise.all([
    patch(user.cookie),
    patch(user.cookie, { ...update, firstNames: 'Otra persona' }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await responses.find((r) => r.status === 409)!.json()).toMatchObject({
    code: 'PROFILE_CONFLICT',
  });
  expect((await getPrivateProfile(env.DB, user.id))?.user.profileVersion).toBe(
    1,
  );
  expect((await patch(user.cookie)).status).toBe(409);
  expect(
    (await patch(user.cookie, { ...update, profileVersion: 1 })).status,
  ).toBe(200);
});
it.each([
  { firstNames: '' },
  { lastNames: '\u0000' },
  { birthDate: '2025-02-29' },
  { birthDate: '9999-01-01' },
  { birthDate: '2000-13-01' },
  { birthDate: '0000-01-01' },
  { firstNames: 'a'.repeat(101) },
  { profileVersion: -1 },
  { profileVersion: 0.5 },
  { profileVersion: '0' },
  { senatiId: 'change' },
  { trainerName: 'change' },
  { role: 'teacher' },
  { id: 'other' },
  { age: 18 },
])(
  'rejects invalid or protected fields %j without writing',
  async (invalid) => {
    const user = await fixture();
    expect((await patch(user.cookie, { ...update, ...invalid })).status).toBe(
      400,
    );
    expect(
      (await getPrivateProfile(env.DB, user.id))?.user.profileVersion,
    ).toBe(0);
  },
);
it('requires a current cookie, same origin and bounded JSON', async () => {
  const user = await fixture();
  expect((await patch('')).status).toBe(401);
  expect(
    (await patch(user.cookie, update, { Origin: 'https://evil.example' }))
      .status,
  ).toBe(403);
  expect(
    (await patch(user.cookie, update, { 'Content-Type': 'text/plain' })).status,
  ).toBe(415);
  expect(
    (await patch(user.cookie, { ...update, firstNames: 'a'.repeat(9000) }))
      .status,
  ).toBe(413);
  const malformed = await app.request(
    `${origin}/api/me/profile`,
    {
      method: 'PATCH',
      headers: {
        Cookie: user.cookie,
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: '{',
    },
    bindings,
  );
  expect(malformed.status).toBe(400);
  expect((await getPrivateProfile(env.DB, user.id))?.user.profileVersion).toBe(
    0,
  );
});
it('only edits the authenticated owner and permits teacher reads but denies peers', async () => {
  const a = await fixture(),
    b = await fixture(),
    teacher = await fixture('teacher');
  const read = (cookie: string) =>
    app.request(
      `${origin}/api/admin/users/${b.id}`,
      { headers: { Cookie: cookie } },
      bindings,
    );
  expect((await read(a.cookie)).status).toBe(403);
  expect((await read(teacher.cookie)).status).toBe(200);
  expect((await patch(a.cookie, { ...update, userId: b.id })).status).toBe(400);
  expect((await patch(teacher.cookie)).status).toBe(200);
  expect((await getPrivateProfile(env.DB, b.id))?.user.profileVersion).toBe(0);
  expect(
    (await getPrivateProfile(env.DB, teacher.id))?.user.profileVersion,
  ).toBe(1);
});
