import { z } from 'zod';
import { InvalidRegistration, parsePersonalDetails } from './registration';

export const profileUpdateSchema = z
  .strictObject({
    firstNames: z.string().max(1024),
    lastNames: z.string().max(1024),
    birthDate: z.string().max(1024),
    profileVersion: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
  })
  .transform((value, ctx) => {
    try {
      return {
        ...parsePersonalDetails(value),
        profileVersion: value.profileVersion,
      };
    } catch (error) {
      if (!(error instanceof InvalidRegistration)) throw error;
      ctx.addIssue({
        code: 'custom',
        path: [error.field],
        message: error.message,
      });
      return z.NEVER;
    }
  });
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
