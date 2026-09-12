import { Hono } from 'hono';
import type { HealthResponse } from '../shared/contracts/health';

const app = new Hono();

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

app.notFound((context) => context.json({ error: 'Ruta no encontrada.' }, 404));
app.onError((_error, context) =>
  context.json({ error: 'No se pudo completar la solicitud.' }, 500),
);

export default app;
