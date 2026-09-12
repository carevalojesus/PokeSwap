import type { D1Migration } from 'cloudflare:test';

declare module 'vitest' {
  export interface ProvidedContext {
    migrations: D1Migration[];
  }
}
