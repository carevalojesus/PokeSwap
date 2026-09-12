export const SESSION_COOKIE = '__Host-pokeswap-session';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax' as const,
  path: '/',
};

export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
export async function tokenHash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
export interface Identity {
  userId: string;
  role: 'student' | 'teacher';
  tokenHash: string;
  expiresAt: number;
}

export async function authenticate(
  db: D1Database,
  token: string | undefined,
  now: number,
): Promise<Identity | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db
    .prepare(
      `SELECT u.id AS userId, u.role, s.token_hash AS tokenHash, s.expires_at AS expiresAt
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?`,
    )
    .bind(await tokenHash(token), now)
    .first<Identity>();
}

export async function createSession(
  db: D1Database,
  userId: string,
  expectedPasswordHash: string,
  oldToken: string | undefined,
  now: number,
) {
  const token = randomToken();
  const hash = await tokenHash(token);
  const expiresAt = now + SESSION_SECONDS;
  const guard = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  if (oldToken && /^[a-f0-9]{64}$/.test(oldToken)) {
    statements.push(
      db
        .prepare(
          'UPDATE sessions SET revoked_at=coalesce(revoked_at, ?) WHERE token_hash=?',
        )
        .bind(now, await tokenHash(oldToken)),
    );
  }
  statements.push(
    // Credentials may have changed since verification. Do not mint a session
    // from stale credentials after an operator changes the password.
    db
      .prepare(
        `INSERT INTO sessions (token_hash,user_id,created_at,expires_at)
      SELECT ?,id,?,? FROM users WHERE id=? AND password_hash=?`,
      )
      .bind(hash, now, expiresAt, userId, expectedPasswordHash),
    db
      .prepare('INSERT INTO transaction_guards (id,ok) VALUES (?,changes()=1)')
      .bind(guard),
    db.prepare('DELETE FROM transaction_guards WHERE id=?').bind(guard),
  );
  await db.batch(statements);
  return { token, expiresAt };
}

export async function revokeSession(
  db: D1Database,
  token: string | undefined,
  now: number,
) {
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await db
      .prepare(
        'UPDATE sessions SET revoked_at=coalesce(revoked_at, ?) WHERE token_hash=?',
      )
      .bind(now, await tokenHash(token))
      .run();
  }
}
