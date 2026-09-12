import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { authenticate, SESSION_COOKIE, type Identity } from './session';

export type AuthEnv = {
  Bindings: {
    DB: D1Database;
    AUTH_IP_LIMITER: RateLimit;
    AUTH_ACCOUNT_LIMITER: RateLimit;
  };
  Variables: { identity: Identity };
};
export const requireSession = createMiddleware<AuthEnv>(async (c, next) => {
  const identity = await authenticate(
    c.env.DB,
    getCookie(c, SESSION_COOKIE),
    Math.floor(Date.now() / 1000),
  );
  if (!identity)
    return c.json(
      { error: 'Inicia sesión para continuar.', code: 'UNAUTHENTICATED' },
      401,
    );
  c.set('identity', identity);
  await next();
});
export const requireTeacher = createMiddleware<AuthEnv>(async (c, next) => {
  if (c.get('identity').role !== 'teacher')
    return c.json(
      { error: 'No tienes permiso para esta operación.', code: 'FORBIDDEN' },
      403,
    );
  await next();
});
// Apply after requireSession to routes that operate on a user's private resource.
// Future mutations must also include the owner in their SQL preconditions.
export const requireSelfOrTeacher = (parameter = 'id') =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const identity = c.get('identity');
    if (
      identity.role !== 'teacher' &&
      identity.userId !== c.req.param(parameter)
    ) {
      return c.json(
        { error: 'No tienes permiso para esta operación.', code: 'FORBIDDEN' },
        403,
      );
    }
    await next();
  });

export const sameOriginMutation = createMiddleware<AuthEnv>(async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
  const origin = c.req.header('Origin');
  const site = c.req.header('Sec-Fetch-Site');
  if (
    origin !== new URL(c.req.url).origin ||
    (site && !['same-origin', 'none'].includes(site))
  ) {
    return c.json(
      { error: 'Origen de solicitud no permitido.', code: 'INVALID_ORIGIN' },
      403,
    );
  }
  await next();
});
