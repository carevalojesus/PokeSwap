import { Hono } from 'hono';
import profileRoutes from './auth/profile-routes';
import authRoutes from './auth/routes';
import {
  type AuthEnv,
  requireSession,
  requireTeacher,
  sameOriginMutation,
} from './auth/middleware';
import { getPrivateProfile } from './auth/profile';
import type { HealthResponse } from '../shared/contracts/health';

const app = new Hono<AuthEnv>();

app.use('*', async (context, next) => {
  context.header('Cache-Control', 'no-store');
  context.header('X-Content-Type-Options', 'nosniff');
  await next();
});

app.get('/api/health', (context) => {
  const health: HealthResponse = {
    status: 'ok',
    service: 'pokeswap-classroom',
  };
  return context.json(health);
});

app.use('/api/*', sameOriginMutation);
app.route('/api/auth', authRoutes);
app.route('/api/me', profileRoutes);
app.use('/api/me/*', requireSession);
app.use('/api/admin/*', requireSession, requireTeacher);
app.get('/api/me', async (c) => {
  const profile = await getPrivateProfile(c.env.DB, c.get('identity').userId);
  if (!profile) return c.json({ error: 'Perfil no encontrado.' }, 404);
  return c.json({
    ...profile,
    session: { expiresAt: c.get('identity').expiresAt },
  });
});
app.get('/api/admin/users/:id', async (c) => {
  const profile = await getPrivateProfile(c.env.DB, c.req.param('id'));
  if (!profile) return c.json({ error: 'Perfil no encontrado.' }, 404);
  return c.json(profile);
});

app.notFound((context) => context.json({ error: 'Ruta no encontrada.' }, 404));
app.onError((_error, context) =>
  context.json({ error: 'No se pudo completar la solicitud.' }, 500),
);

export default app;
