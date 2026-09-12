import { describe, expect, it } from 'vitest';
import { InvalidRegistration, limaDate, parseRegistration } from './input';

const now = new Date('2026-09-12T02:00:00Z'); // Still September 11 in Lima.
const valid = {
  senatiId: '  001-ab  ',
  firstNames: '  Ana   Mari\u0301a  ',
  lastNames: 'Arévalo Pérez',
  birthDate: '2004-02-29',
  password: ' una frase muy larga ',
};

describe('registration normalization', () => {
  it('preserves leading zeros, separators, accents and password bytes', () => {
    expect(parseRegistration(valid, now)).toEqual({
      ...valid,
      senatiId: '001-AB',
      firstNames: 'Ana María',
    });
    expect(limaDate(now)).toBe('2026-09-11');
  });
  it('accepts today in Lima and the leap year 2000', () => {
    expect(
      parseRegistration({ ...valid, birthDate: '2026-09-11' }, now).birthDate,
    ).toBe('2026-09-11');
    expect(
      parseRegistration({ ...valid, birthDate: '2000-02-29' }, now).birthDate,
    ).toBe('2000-02-29');
  });
  it.each([
    '2026-09-12',
    '2027-01-01',
    '1900-02-29',
    '2025-02-29',
    '2024-04-31',
    '0000-01-01',
    '2000-00-01',
    '2000-13-01',
    '2000-01-00',
    '2000-1-01',
    '2000-01-01T00:00:00Z',
  ])('rejects invalid or future birth date %s', (birthDate) => {
    expect(() => parseRegistration({ ...valid, birthDate }, now)).toThrow(
      InvalidRegistration,
    );
  });
  it.each([
    '',
    '   ',
    '001 AB',
    '001\tAB',
    '\n001AB',
    '001\u200bAB',
    '001\u202eAB',
    'A'.repeat(33),
  ])('rejects invalid SENATI ID %s', (senatiId) => {
    expect(() => parseRegistration({ ...valid, senatiId }, now)).toThrow(
      InvalidRegistration,
    );
  });
  it.each(['', '  ', 'A'.repeat(101), 'Ana\u0000', 'Ana\u202e'])(
    'rejects invalid names %s',
    (firstNames) => {
      expect(() => parseRegistration({ ...valid, firstNames }, now)).toThrow(
        InvalidRegistration,
      );
    },
  );
  it.each([
    'short',
    'x'.repeat(129),
    'una frase con\ncontrol',
    '\ud800'.repeat(15),
  ])('rejects invalid passwords', (password) => {
    expect(() => parseRegistration({ ...valid, password }, now)).toThrow(
      InvalidRegistration,
    );
  });
  it.each([
    null,
    [],
    {},
    { ...valid, senatiId: 123 },
    { ...valid, role: 'teacher' },
    { ...valid, speciesId: 150 },
    { ...valid, trainerName: 'Chosen' },
    { ...valid, firstNames: 'x'.repeat(1025) },
  ])('rejects missing, non-text and server-controlled fields', (input) => {
    expect(() => parseRegistration(input, now)).toThrow(InvalidRegistration);
  });
});
