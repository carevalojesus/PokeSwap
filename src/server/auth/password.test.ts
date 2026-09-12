import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('native Workers password hashing', () => {
  it('salts equal passwords independently and verifies without changing Unicode or whitespace', async () => {
    const password = '  contraseña larga 🔑  ';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).toMatch(
      /^scrypt\$v1\$16384\$8\$5\$[a-f0-9]{32}\$[a-f0-9]{64}$/,
    );
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(password.trim(), first)).toBe(false);
    expect(await verifyPassword('different password', first)).toBe(false);
  });
  it.each([
    '',
    'plaintext',
    'scrypt$v1$999999999$8$5$aa$bb',
    'scrypt$v2$16384$8$5$aa$bb',
  ])('rejects malformed or unsupported hashes: %s', async (hash) => {
    expect(await verifyPassword('some password', hash)).toBe(false);
  });
});

// Fixture generated independently with Python/OpenSSL hashlib.scrypt.
it('verifies a hash produced outside Workers with the same standard scrypt profile', async () => {
  const hash =
    'scrypt$v1$16384$8$5$000102030405060708090a0b0c0d0e0f$e0a9928cac27a6d7a08072d01b972d5c733717c6ac373b7f5870a9272f0dc4b0';
  expect(await verifyPassword('interop password example', hash)).toBe(true);
});
