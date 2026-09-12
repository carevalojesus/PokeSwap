import { Hono } from 'hono';
import { z } from 'zod';
import {
  type AuthEnv,
  requireSession,
  requireTeacher,
} from '../auth/middleware';
import { readJson } from '../auth/read-json';
import { createDropSchema, redeemDropSchema } from '../../shared/schemas/drops';
import {
  DropError,
  createDrop,
  cancelDrop,
  listDrops,
  detail,
  previewDrop,
  redeemDrop,
} from './service';

const routes = new Hono<AuthEnv>();
routes.use('/admin/drops', requireSession, requireTeacher);
routes.use('/admin/drops/*', requireSession, requireTeacher);
routes.use('/drops/*', requireSession, async (c, next) => {
  if (c.get('identity').role !== 'student')
    return c.json(
      { code: 'FORBIDDEN', error: 'Solo alumnos pueden canjear.' },
      403,
    );
  await next();
});
routes.use('*', async (c, next) => {
  // Mounted beneath /api: only drop routes participate in this middleware.
  if (!/^\/api\/(admin\/drops(?:\/|$)|drops\/)/.test(c.req.path)) return next();
  if (
    c.req.method !== 'GET' &&
    !(
      await c.env.AUTH_ACCOUNT_LIMITER.limit({
        key: `pokeswap:drops:${c.get('identity').userId}`,
      })
    ).success
  )
    return c.json(
      { code: 'RATE_LIMITED', error: 'Espera antes de volver a intentarlo.' },
      429,
      { 'Retry-After': '60' },
    );
  await next();
});
async function input<T>(request: Request, schema: z.ZodType<T>) {
  try {
    return schema.parse(await readJson(request));
  } catch {
    return null;
  }
}
routes.get('/admin/drops', async (c) =>
  c.json(await listDrops(c.env.DB, c.get('identity').userId)),
);
routes.get('/admin/drops/:id', async (c) => {
  const id = z.uuid().safeParse(c.req.param('id'));
  if (!id.success) return c.json({ code: 'INVALID_INPUT' }, 400);
  return c.json(
    await detail(
      c.env.DB,
      c.env.DROPS_TOKEN_SECRET,
      c.get('identity').userId,
      id.data,
    ),
  );
});
routes.post('/admin/drops', async (c) => {
  const data = await input(c.req.raw, createDropSchema);
  if (!data) return c.json({ code: 'INVALID_INPUT' }, 400);
  return c.json(
    await createDrop(
      c.env.DB,
      c.env.DROPS_TOKEN_SECRET,
      c.get('identity').userId,
      data,
    ),
  );
});
routes.post('/admin/drops/:id/cancel', async (c) => {
  const id = z.uuid().safeParse(c.req.param('id'));
  if (!id.success) return c.json({ code: 'INVALID_INPUT' }, 400);
  return c.json(await cancelDrop(c.env.DB, c.get('identity').userId, id.data));
});
routes.post('/drops/preview', async (c) => {
  const data = await input(c.req.raw, redeemDropSchema);
  if (!data) return c.json({ code: 'INVALID_INPUT' }, 400);
  return c.json(
    await previewDrop(c.env.DB, c.get('identity').userId, data.code),
  );
});
routes.post('/drops/redeem', async (c) => {
  const data = await input(c.req.raw, redeemDropSchema);
  if (!data) return c.json({ code: 'INVALID_INPUT' }, 400);
  return c.json({
    reward: await redeemDrop(c.env.DB, c.get('identity').userId, data.code),
  });
});
routes.onError((error, c) =>
  error instanceof DropError
    ? c.json({ code: error.code }, error.status)
    : c.json(
        {
          code: 'DROP_UNCONFIRMED',
          error:
            'No se pudo confirmar. Consulta el resultado antes de reintentar.',
        },
        503,
      ),
);
export default routes;
