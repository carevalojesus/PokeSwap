import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawPokemon } from './draw';
import { uniformInteger } from './random';

function sequence(...values: number[]) {
  let index = 0;
  return vi.fn(() => {
    if (index === values.length) throw new Error('Unexpected extra draw');
    return values[index++];
  });
}

afterEach(() => vi.restoreAllMocks());

describe('unbiased uint32 selection', () => {
  it.each([1000, 149])('rejects the incomplete tail for bound %i', (bound) => {
    const limit = 2 ** 32 - (2 ** 32 % bound);
    const source = sequence(limit, 2 ** 32 - 1, limit - 1);
    expect(uniformInteger(bound, source)).toBe(bound - 1);
    expect(source).toHaveBeenCalledTimes(3);
    expect(uniformInteger(bound, sequence(0))).toBe(0);
  });
  it('supports the full uint32 range and a single outcome', () => {
    expect(uniformInteger(2 ** 32, sequence(2 ** 32 - 1))).toBe(2 ** 32 - 1);
    expect(uniformInteger(1, sequence(2 ** 32 - 1))).toBe(0);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 2 ** 32 + 1])(
    'rejects invalid bound %s',
    (bound) => {
      const source = sequence(0);
      expect(() => uniformInteger(bound, source)).toThrow(RangeError);
      expect(source).not.toHaveBeenCalled();
    },
  );
  it.each([-1, 0.5, NaN, Infinity, 2 ** 32])(
    'rejects invalid source value %s',
    (value) => {
      expect(() => uniformInteger(1000, sequence(value))).toThrow(RangeError);
    },
  );
  it('uses Web Crypto by default and propagates entropy failure', () => {
    const cryptoSource = vi
      .spyOn(crypto, 'getRandomValues')
      .mockImplementation((array) => {
        (array as Uint32Array)[0] = 1;
        return array;
      });
    expect(drawPokemon()).toEqual({ speciesId: 151, probabilitiesVersion: 1 });
    expect(cryptoSource).toHaveBeenCalledTimes(1);
    cryptoSource.mockImplementation(() => {
      throw new Error('entropy unavailable');
    });
    expect(() => drawPokemon()).toThrow('entropy unavailable');
  });
});

describe('version 1 reward distribution', () => {
  it('allocates exactly one ticket to each rare species and 998 to common species', () => {
    const counts = new Map<number, number>();
    for (let ticket = 0; ticket < 1000; ticket++) {
      const source = sequence(ticket, 0);
      const result = drawPokemon(source);
      expect(result.probabilitiesVersion).toBe(1);
      expect(source).toHaveBeenCalledTimes(ticket < 2 ? 1 : 2);
      counts.set(result.speciesId, (counts.get(result.speciesId) ?? 0) + 1);
    }
    expect([...counts]).toEqual([
      [150, 1],
      [151, 1],
      [1, 998],
    ]);
  });
  it('gives each of the 149 common species one equal second-stage outcome', () => {
    for (const ticket of [2, 999]) {
      const outcomes = Array.from(
        { length: 149 },
        (_, value) => drawPokemon(sequence(ticket, value)).speciesId,
      );
      expect(outcomes).toEqual(Array.from({ length: 149 }, (_, i) => i + 1));
    }
  });
  it.each([0, 1, 999])(
    'allows three independent identical results for ticket %i',
    (ticket) => {
      const source = sequence(
        ...Array.from({ length: 3 }, () =>
          ticket < 2 ? [ticket] : [ticket, 24],
        ).flat(),
      );
      const results = Array.from({ length: 3 }, () => drawPokemon(source));
      expect(results.map((result) => result.speciesId)).toEqual(
        Array(3).fill(ticket === 0 ? 150 : ticket === 1 ? 151 : 25),
      );
      expect(source).toHaveBeenCalledTimes(ticket < 2 ? 3 : 6);
    },
  );
  it('draws without fetching PokéAPI or any other network resource', () => {
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('PokéAPI offline'));
    expect(drawPokemon(sequence(0)).speciesId).toBe(150);
    expect(drawPokemon(sequence(1)).speciesId).toBe(151);
    expect(drawPokemon(sequence(2, 148)).speciesId).toBe(149);
    expect(network).not.toHaveBeenCalled();
  });
});
