import { describe, expect, it } from 'vitest';
import {
  authenticatedProfileSchema,
  loginSchema,
  registrationSchema,
} from '../../shared/schemas/auth';

const registration = {
  senatiId: ' 001-ab ',
  firstNames: ' Ana   Mari\u0301a ',
  lastNames: 'D’Ávila Pérez',
  birthDate: '2004-02-29',
  password: ' una frase muy larga ',
};
describe('shared authentication schemas', () => {
  it('normalizes identifiers/names while preserving password bytes', () => {
    expect(registrationSchema.parse(registration)).toEqual({
      ...registration,
      senatiId: '001-AB',
      firstNames: 'Ana María',
    });
    expect(
      loginSchema.parse({
        senatiId: registration.senatiId,
        password: registration.password,
      }),
    ).toEqual({ senatiId: '001-AB', password: registration.password });
  });
  it('reports the field to the form and rejects role injection', () => {
    const invalid = registrationSchema.safeParse({
      ...registration,
      birthDate: '2001-02-29',
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      expect(invalid.error.issues[0].path).toEqual(['birthDate']);
    expect(
      registrationSchema.safeParse({ ...registration, role: 'teacher' })
        .success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ senatiId: '001', password: 'x', role: 'teacher' })
        .success,
    ).toBe(false);
  });
  it('accepts existing passwords without applying registration minimums', () => {
    expect(
      loginSchema.safeParse({ senatiId: '001', password: 'short' }).success,
    ).toBe(true);
    expect(
      loginSchema.safeParse({ senatiId: '001', password: '' }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ senatiId: '001', password: '\ud800' }).success,
    ).toBe(false);
  });
  it('rejects incomplete responses, extra credentials and incorrect initial ownership shape', () => {
    const response = {
      user: {
        id: 'teacher-test',
        senatiId: '001',
        firstNames: 'Ana',
        lastNames: 'Prueba',
        birthDate: '2000-01-01',
        age: 26,
        trainerName: 'Docente Prueba',
        role: 'teacher',
        profileVersion: 1,
        avatarUrl: null,
      },
      initial: null,
      session: { expiresAt: 2_000_000_000 },
    };
    expect(authenticatedProfileSchema.safeParse(response).success).toBe(true);
    expect(
      authenticatedProfileSchema.safeParse({ ...response, token: 'secret' })
        .success,
    ).toBe(false);
    expect(
      authenticatedProfileSchema.safeParse({
        ...response,
        user: { ...response.user, passwordHash: 'secret' },
      }).success,
    ).toBe(false);
    expect(
      authenticatedProfileSchema.safeParse({
        ...response,
        user: { ...response.user, role: 'student' },
      }).success,
    ).toBe(false);
    expect(
      authenticatedProfileSchema.safeParse({ user: response.user }).success,
    ).toBe(false);
  });
});
