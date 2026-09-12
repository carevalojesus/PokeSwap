import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/** Construct per request from the Worker binding, never from a public URL. */
export function createDatabase(binding: D1Database) {
  return drizzle(binding, { schema });
}
