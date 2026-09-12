import { scrypt, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

// OWASP's 16 MiB scrypt profile; keep parameters fixed when reading stored data
// so a malformed hash cannot request unbounded CPU or memory.
const PARAMETERS = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
const PREFIX = 'scrypt$v1$16384$8$5';

function derive(password: string, salt: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, PARAMETERS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(password, salt);
  return `${PREFIX}$${Buffer.from(salt).toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (new TextEncoder().encode(password).length > 1024) return false;
  const match =
    /^scrypt\$v1\$16384\$8\$5\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(encoded);
  if (!match) return false;
  const actual = await derive(password, Buffer.from(match[1], 'hex'));
  return timingSafeEqual(actual, Buffer.from(match[2], 'hex'));
}
