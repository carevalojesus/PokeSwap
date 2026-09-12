import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthEnv, requireSession } from '../auth/middleware';
import { getPrivateProfile } from '../auth/profile';
import { putAvatar, deleteAvatar } from './service';
import { MediaError, readImage } from './webp';

const app = new Hono<AuthEnv>();
app.use('/me/avatar', requireSession);
app.use('/users/:id/avatar', requireSession);
app.use('/me/avatar', async (c, next) => {
  if (!['PUT', 'DELETE'].includes(c.req.method)) return next();
  if (
    !(
      await c.env.AUTH_ACCOUNT_LIMITER.limit({
        key: `pokeswap:media:${c.get('identity').userId}`,
      })
    ).success
  ) {
    c.header('Retry-After', '60');
    return c.json({ code: 'RATE_LIMITED' }, 429);
  }
  await next();
});
function version(value: string | undefined) {
  if (
    !value ||
    !/^(0|[1-9]\d{0,15})$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) >= Number.MAX_SAFE_INTEGER
  )
    throw new MediaError('INVALID_VERSION');
  return Number(value);
}
app.put('/me/avatar', async (c) => {
  if (c.req.header('Content-Type') !== 'image/webp')
    throw new MediaError('INVALID_CONTENT_TYPE', 415);
  const key = z.uuid().parse(c.req.header('Idempotency-Key'));
  const expected = version(c.req.header('X-Profile-Version'));
  const identity = c.get('identity');
  await putAvatar(
    c.env,
    identity.userId,
    key,
    expected,
    await readImage(c.req.raw),
  );
  const profile = await getPrivateProfile(c.env.DB, identity.userId);
  return c.json({ ...profile, session: { expiresAt: identity.expiresAt } });
});
app.delete('/me/avatar', async (c) => {
  const identity = c.get('identity');
  await deleteAvatar(
    c.env,
    identity.userId,
    version(c.req.header('X-Profile-Version')),
  );
  const profile = await getPrivateProfile(c.env.DB, identity.userId);
  return c.json({ ...profile, session: { expiresAt: identity.expiresAt } });
});
app.get('/users/:id/avatar', async (c) => {
  const user = await c.env.DB.prepare(
    'SELECT avatar_object_key AS key,profile_version AS version FROM users WHERE id=?',
  )
    .bind(c.req.param('id'))
    .first<{ key: string | null; version: number }>();
  if (!user) return c.json({ code: 'NOT_FOUND' }, 404);
  // Default contains no account data. Authentication is checked even for 304.
  const etag = `"avatar-${user.version}-${user.key ?? 'default'}"`;
  c.header('Cache-Control', 'private, no-cache');
  c.header('Vary', 'Cookie');
  c.header('ETag', etag);
  if (c.req.header('If-None-Match') === etag) return c.body(null, 304);
  if (!user.key) {
    c.header('Content-Type', 'image/svg+xml');
    return c.body(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="256" fill="#f4f4f5"/><circle cx="256" cy="185" r="80" fill="#71717a"/><path d="M100 440a156 156 0 0 1 312 0" fill="#71717a"/></svg>',
    );
  }
  const object = await c.env.AVATARS.get(user.key);
  if (!object) {
    c.header('Cache-Control', 'no-store');
    return c.json({ code: 'MEDIA_UNAVAILABLE' }, 503);
  }
  c.header('Content-Type', 'image/webp');
  c.header('Content-Length', String(object.size));
  return c.body(object.body);
});
app.onError((error, c) => {
  if (error instanceof MediaError)
    return c.json({ code: error.code }, error.status);
  if (error instanceof z.ZodError)
    return c.json({ code: 'INVALID_INPUT' }, 400);
  return c.json({ code: 'MEDIA_UNCONFIRMED' }, 503);
});
export default app;
