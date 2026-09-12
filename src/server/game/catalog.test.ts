import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, expect, inject, it, vi } from 'vitest';
import catalog from '../../shared/catalog/species.json';

beforeAll(async () => {
  await applyD1Migrations(env.DB, inject('migrations'));
});

it('imports the full offline catalog through the real migrations', async () => {
  const network = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('PokéAPI offline'));
  try {
    const result = await env.DB.prepare(
      'SELECT id, name, image_path AS imagePath FROM pokemon_species ORDER BY id',
    ).all();
    expect(result.results).toEqual(catalog);
    expect(catalog.map(({ id }) => id)).toEqual(
      Array.from({ length: 151 }, (_, i) => i + 1),
    );
    expect(catalog[149]).toEqual({
      id: 150,
      name: 'mewtwo',
      imagePath: '/pokemon/150.png',
    });
    expect(catalog[150]).toEqual({
      id: 151,
      name: 'mew',
      imagePath: '/pokemon/151.png',
    });
    await applyD1Migrations(env.DB, inject('migrations'));
    expect(
      (
        await env.DB.prepare(
          'SELECT count(*) AS total FROM pokemon_species',
        ).first()
      )?.total,
    ).toBe(151);
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
});
