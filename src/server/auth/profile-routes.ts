import { Hono } from 'hono';
import { z } from 'zod';
import { profileUpdateSchema } from '../../shared/schemas/profile';
import { InvalidRegistration } from '../registration/input';
import { type AuthEnv, requireSession } from './middleware';
import { readJson } from './read-json';
import { getPrivateProfile } from './profile';

const app = new Hono<AuthEnv>();
app.use('/profile', requireSession);
app.patch('/profile', async (c) => {
  if (!/^application\/json(?:\s*;|$)/i.test(c.req.header('Content-Type') ?? ''))
    return c.json(
      { code: 'INVALID_CONTENT_TYPE', error: 'Se requiere JSON.' },
      415,
    );
  const input = profileUpdateSchema.parse(await readJson(c.req.raw));
  const identity = c.get('identity');
  // The authenticated owner and expected version are SQL preconditions, not a prior read.
  const result = await c.env.DB.prepare(
    `UPDATE users SET first_names=?, last_names=?, birth_date=?,
    profile_version=profile_version+1, updated_at=MAX(updated_at,?)
    WHERE id=? AND profile_version=? RETURNING profile_version AS profileVersion`,
  )
    .bind(
      input.firstNames,
      input.lastNames,
      input.birthDate,
      Math.floor(Date.now() / 1000),
      identity.userId,
      input.profileVersion,
    )
    .first<{ profileVersion: number }>();
  if (!result)
    return c.json(
      {
        code: 'PROFILE_CONFLICT',
        error:
          'El perfil cambió. Consulta los datos actuales antes de guardar.',
      },
      409,
    );
  const profile = await getPrivateProfile(c.env.DB, identity.userId);
  if (!profile) throw new Error('profile_unavailable');
  return c.json({ ...profile, session: { expiresAt: identity.expiresAt } });
});
app.onError((error, c) => {
  if (error instanceof z.ZodError || error instanceof InvalidRegistration)
    return c.json(
      { code: 'INVALID_INPUT', error: 'Revisa los datos del perfil.' },
      400,
    );
  if (error instanceof RangeError && error.message === 'body_limit')
    return c.json(
      { code: 'BODY_TOO_LARGE', error: 'El cuerpo supera 8 KiB.' },
      413,
    );
  return c.json(
    { code: 'INTERNAL_ERROR', error: 'No se pudo confirmar el guardado.' },
    500,
  );
});
export default app;
