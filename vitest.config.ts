import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      remoteBindings: false,
      miniflare: { d1Databases: { DB: 'pokeswap-unit-tests' } },
    }),
  ],
  test: {
    include: ['src/server/**/*.test.ts'],
    provide: { migrations: await readD1Migrations('./migrations') },
  },
}));
