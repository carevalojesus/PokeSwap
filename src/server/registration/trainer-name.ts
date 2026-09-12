import { uniformInteger, secureUint32 } from '../game/random';

export const TRAINER_NAME_VERSION = 1;
const starts = [
  'Kai',
  'Lu',
  'Nao',
  'Teo',
  'Ari',
  'Eli',
  'Sora',
  'Mio',
] as const;
const endings = ['ro', 'mi', 'on', 'ri', 'lan', 'ren', 'na', 'li'] as const;
const epithets = [
  'del Trueno',
  'de la Aurora',
  'del Alba',
  'de la Bruma',
  'del Bosque',
  'del Viento',
] as const;
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function trainerNameKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

// Curated two-syllable combinations; no personal data or external name service.
export function generateTrainerName(nextUint32: () => number = secureUint32) {
  const pick = <T>(values: readonly T[]) =>
    values[uniformInteger(values.length, nextUint32)];
  const stem = pick(starts) + pick(endings);
  const epithet = pick(epithets);
  const suffix = Array.from(
    { length: 4 },
    () => alphabet[uniformInteger(alphabet.length, nextUint32)],
  ).join('');
  const name = `${stem} ${epithet} · ${suffix}`;
  return { name, key: trainerNameKey(name), version: TRAINER_NAME_VERSION };
}
