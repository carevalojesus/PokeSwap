import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [base, credentialsPath] = process.argv.slice(2);
if (!base || !credentialsPath)
  throw new Error(
    'Uso: npm run smoke:auth -- https://host /ruta/privada/credentials.json',
  );
const url = new URL(base);
if (
  url.protocol !== 'https:' &&
  !(
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(url.hostname)
  )
)
  throw new Error('Usa HTTPS o un proxy local de pruebas.');
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
assert.equal(credentials.status, 'created');
const send = (path, body, cookie) =>
  fetch(new URL(path, url), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: process.env.POKESWAP_SMOKE_ORIGIN ?? url.origin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
const login = await send('/api/auth/login', {
  senatiId: credentials.senatiId,
  password: credentials.password,
});
assert.equal(login.status, 200, 'login');
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie, 'session cookie');
try {
  const body = await login.json();
  assert.equal(body.user.id, credentials.userId);
  assert.equal(body.user.role, 'teacher');
  assert.equal(body.initial, null);
  assert.equal(login.headers.get('cache-control'), 'no-store');
  const me = await send('/api/me', undefined, cookie);
  assert.equal(me.status, 200, 'private profile');
  const own = await me.json();
  assert.equal(own.user.id, credentials.userId);
  assert.ok(!('passwordHash' in own.user));
  const admin = await send(
    `/api/admin/users/${credentials.userId}`,
    undefined,
    cookie,
  );
  assert.equal(admin.status, 200, 'teacher permission');
} finally {
  const logout = await send('/api/auth/logout', {}, cookie);
  assert.equal(logout.status, 204, 'logout');
}
assert.equal(
  (await send('/api/me', undefined, cookie)).status,
  401,
  'revoked session',
);
console.log(
  'OK auth: teacher login, private profile, permission, logout and revocation.',
);
