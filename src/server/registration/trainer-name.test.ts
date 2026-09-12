import { expect, it } from 'vitest';
import { generateTrainerName, trainerNameKey } from './trainer-name';

it('generates a reviewed two-syllable name, epithet and four readable characters', () => {
  expect(generateTrainerName(() => 0)).toEqual({
    name: 'Kairo del Trueno · 2222',
    key: 'kairo del trueno · 2222',
    version: 1,
  });
  const values = [1, 2, 1, 8, 9, 10, 11];
  const alias = generateTrainerName(() => values.shift()!);
  expect(alias.name).toBe('Luon de la Aurora · ABCD');
  expect(alias.key).toBe(trainerNameKey(alias.name));
  expect(values).toEqual([]);
});

it('canonicalizes Unicode, case and whitespace in alias keys', () => {
  expect(trainerNameKey('  KAIRO　del  Trueno · ＡＢＣＤ ')).toBe(
    'kairo del trueno · abcd',
  );
});
