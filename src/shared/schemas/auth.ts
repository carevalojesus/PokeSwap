import { z } from 'zod';
import {
  InvalidRegistration,
  normalizeSenatiId,
  parseRegistration,
} from './registration';

const text = () =>
  z
    .string({ error: 'Este campo es obligatorio y debe ser texto.' })
    .refine((value) => value.length <= 1024, 'El campo es demasiado largo.');
export const registrationSchema = z
  .strictObject({
    senatiId: text(),
    firstNames: text(),
    lastNames: text(),
    birthDate: text(),
    password: text(),
  })
  .transform((value, ctx) => {
    try {
      return parseRegistration(value);
    } catch (error) {
      if (!(error instanceof InvalidRegistration)) throw error;
      ctx.addIssue({
        code: 'custom',
        path: error.field === 'body' ? [] : [error.field],
        message: error.message,
      });
      return z.NEVER;
    }
  });
export const loginSchema = z.strictObject({
  senatiId: text().transform((value, ctx) => {
    try {
      return normalizeSenatiId(value);
    } catch (error) {
      if (!(error instanceof InvalidRegistration)) throw error;
      ctx.addIssue({ code: 'custom', message: error.message });
      return z.NEVER;
    }
  }),
  password: text().refine(
    (value) =>
      value.length > 0 &&
      !/[\p{Cc}\p{Cs}]/u.test(value) &&
      new TextEncoder().encode(value).length <= 1024,
    'Escribe tu contraseña sin caracteres de control.',
  ),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Runtime response contract: unknown/extra fields are rejected before caching.
export const authenticatedProfileSchema = z
  .strictObject({
    user: z.strictObject({
      id: z.string().min(1),
      senatiId: z.string().min(1),
      firstNames: z.string(),
      lastNames: z.string(),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      age: z.number().int().nonnegative(),
      trainerName: z.string().min(1),
      role: z.enum(['student', 'teacher']),
      profileVersion: z.number().int().nonnegative(),
      avatarUrl: z.string().startsWith('/api/users/').nullable(),
    }),
    initial: z
      .strictObject({
        instanceId: z.string().min(1),
        speciesId: z.number().int().min(1).max(151),
        probabilitiesVersion: z.number().int().positive(),
      })
      .nullable(),
    session: z.strictObject({ expiresAt: z.number().int().positive() }),
  })
  .refine(
    (value) =>
      value.user.role === 'teacher'
        ? value.initial === null
        : value.initial !== null,
    'El perfil no está completo.',
  );
