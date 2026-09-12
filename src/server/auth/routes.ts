import { Hono } from 'hono';
import { z } from 'zod';
import { loginSchema, registrationSchema } from '../../shared/schemas/auth';
import { getCookie, setCookie } from 'hono/cookie';
import {
  createRegistrationService,
  RegistrationConflict,
  TrainerNameUnavailable,
} from '../registration/register';
import { InvalidRegistration } from '../registration/input';
import { verifyPassword } from './password';
import {
  cookieOptions,
  createSession,
  revokeSession,
  SESSION_COOKIE,
  SESSION_SECONDS,
  tokenHash,
} from './session';
import { type AuthEnv, requireSession } from './middleware';
import { getPrivateProfile } from './profile';

// Fixed valid hash: unknown IDs still run the same password derivation path.
const DUMMY_HASH =
  'scrypt$v1$16384$8$5$000102030405060708090a0b0c0d0e0f$e0a9928cac27a6d7a08072d01b972d5c733717c6ac373b7f5870a9272f0dc4b0';
const now = () => Math.floor(Date.now() / 1000);
const app = new Hono<AuthEnv>();

// Count actual streamed bytes even when Content-Length is absent or misleading.
async function readJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader)
    throw new InvalidRegistration('body', 'Se requiere un cuerpo JSON.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new RangeError('body_limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new InvalidRegistration('body', 'El cuerpo JSON no es válido.');
  }
}

app.use('*', async (c, next) => {
  if (c.req.method !== 'POST') return next();
  if (
    !/^application\/json(?:\s*;|$)/i.test(c.req.header('Content-Type') ?? '')
  ) {
    return c.json(
      {
        error: 'Usa Content-Type application/json.',
        code: 'INVALID_CONTENT_TYPE',
      },
      415,
    );
  }
  // Logout must remain available even when authentication attempts are limited.
  if (c.req.path.endsWith('/logout')) return next();
  // IP ceiling is deliberately wider than the per-account limit for classroom NAT.
  const ip = c.req.header('CF-Connecting-IP') ?? 'local';
  const result = await c.env.AUTH_IP_LIMITER.limit({
    key: `pokeswap:auth:ip:${await tokenHash(ip)}`,
  });
  if (!result.success) {
    c.header('Retry-After', '60');
    return c.json(
      { error: 'Demasiados intentos. Espera un minuto.', code: 'RATE_LIMITED' },
      429,
    );
  }
  await next();
});

app.post('/register', async (c) => {
  const input = registrationSchema.parse(await readJson(c.req.raw));
  if (
    !(
      await c.env.AUTH_ACCOUNT_LIMITER.limit({
        key: `pokeswap:auth:account:${await tokenHash(input.senatiId)}`,
      })
    ).success
  ) {
    c.header('Retry-After', '60');
    return c.json(
      { error: 'Demasiados intentos. Espera un minuto.', code: 'RATE_LIMITED' },
      429,
    );
  }
  const result = await createRegistrationService(c.env.DB)(input);
  const credential = await c.env.DB.prepare(
    'SELECT password_hash AS hash FROM users WHERE id=?',
  )
    .bind(result.userId)
    .first<{ hash: string }>();
  const profile = await getPrivateProfile(c.env.DB, result.userId);
  if (!credential || !profile)
    throw new Error('registered_profile_unavailable');
  try {
    const session = await createSession(
      c.env.DB,
      result.userId,
      credential.hash,
      getCookie(c, SESSION_COOKIE),
      now(),
    );
    setCookie(c, SESSION_COOKIE, session.token, {
      ...cookieOptions,
      maxAge: SESSION_SECONDS,
    });
    return c.json(
      { ...profile, session: { expiresAt: session.expiresAt } },
      201,
    );
  } catch {
    return c.json(
      {
        error: 'La cuenta fue creada. Inicia sesión para recuperar tu inicial.',
        code: 'SESSION_START_FAILED',
      },
      503,
    );
  }
});

app.post('/login', async (c) => {
  const body = loginSchema.parse(await readJson(c.req.raw));
  const senatiId = body.senatiId;
  if (
    !(
      await c.env.AUTH_ACCOUNT_LIMITER.limit({
        key: `pokeswap:auth:account:${await tokenHash(senatiId)}`,
      })
    ).success
  ) {
    c.header('Retry-After', '60');
    return c.json(
      { error: 'Demasiados intentos. Espera un minuto.', code: 'RATE_LIMITED' },
      429,
    );
  }
  const user = await c.env.DB.prepare(
    'SELECT id,password_hash AS hash FROM users WHERE senati_id=?',
  )
    .bind(senatiId)
    .first<{ id: string; hash: string }>();
  const valid = await verifyPassword(body.password, user?.hash ?? DUMMY_HASH);
  if (!user || !valid)
    return c.json(
      { error: 'ID o contraseña incorrectos.', code: 'INVALID_CREDENTIALS' },
      401,
    );
  const profile = await getPrivateProfile(c.env.DB, user.id);
  if (!profile)
    return c.json(
      { error: 'ID o contraseña incorrectos.', code: 'INVALID_CREDENTIALS' },
      401,
    );
  const session = await createSession(
    c.env.DB,
    user.id,
    user.hash,
    getCookie(c, SESSION_COOKIE),
    now(),
  );
  setCookie(c, SESSION_COOKIE, session.token, {
    ...cookieOptions,
    maxAge: SESSION_SECONDS,
  });
  return c.json({ ...profile, session: { expiresAt: session.expiresAt } });
});

app.post('/logout', async (c) => {
  const body = await readJson(c.req.raw);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 0
  )
    throw new InvalidRegistration('body', 'Envía un objeto JSON vacío.');
  await revokeSession(c.env.DB, getCookie(c, SESSION_COOKIE), now());
  setCookie(c, SESSION_COOKIE, '', {
    ...cookieOptions,
    maxAge: 0,
    expires: new Date(0),
  });
  return c.body(null, 204);
});

app.get('/session', requireSession, (c) => {
  const identity = c.get('identity');
  return c.json({
    userId: identity.userId,
    role: identity.role,
    expiresAt: identity.expiresAt,
  });
});

app.onError((error, c) => {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const field = typeof issue?.path[0] === 'string' ? issue.path[0] : 'body';
    return c.json(
      {
        error:
          field === 'body'
            ? 'Los datos contienen campos inválidos o no admitidos.'
            : issue.message,
        code: 'INVALID_INPUT',
        field,
      },
      400,
    );
  }
  if (error instanceof InvalidRegistration)
    return c.json(
      { error: error.message, code: 'INVALID_INPUT', field: error.field },
      400,
    );
  if (error instanceof RegistrationConflict)
    return c.json({ error: error.message, code: 'ACCOUNT_EXISTS' }, 409);
  if (error instanceof TrainerNameUnavailable)
    return c.json({ error: error.message, code: 'ALIAS_UNAVAILABLE' }, 503);
  if (error instanceof RangeError && error.message === 'body_limit')
    return c.json(
      { error: 'El cuerpo supera 8 KiB.', code: 'BODY_TOO_LARGE' },
      413,
    );
  return c.json(
    { error: 'No se pudo completar la solicitud.', code: 'INTERNAL_ERROR' },
    500,
  );
});
export default app;
