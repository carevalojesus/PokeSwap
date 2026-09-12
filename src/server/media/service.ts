import { MediaError, validateWebp } from './webp';

export type MediaEnv = { DB: D1Database; AVATARS: R2Bucket };
export interface Upload {
  id: string;
  user_id: string;
  idempotency_key: string;
  object_key: string;
  file_hash: string;
  expected_profile_version: number;
  state: 'pending' | 'stored' | 'committed' | 'failed';
  updated_at: number;
}
const conflict = () => new MediaError('PROFILE_CONFLICT', 409);
export function queueCleanup(
  db: D1Database,
  key: string,
  reason: string,
  now: number,
) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO media_cleanup_jobs(id,object_key,reason,state,attempts,next_attempt_at,created_at,updated_at)
    VALUES (?, ?, ?, 'pending',0,?,?,?)`,
    )
    .bind(crypto.randomUUID(), key, reason, now, now, now);
}
async function finalize(env: MediaEnv, upload: Upload, now: number) {
  const { DB: db } = env;
  if (upload.state === 'committed') return;
  if (upload.state === 'failed') throw conflict();
  const guard = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO media_cleanup_jobs(id,object_key,reason,state,attempts,next_attempt_at,created_at,updated_at)
        SELECT ?,avatar_object_key,'replaced','pending',0,?,?,? FROM users
        WHERE id=? AND profile_version=? AND avatar_object_key IS NOT NULL
        AND EXISTS(SELECT 1 FROM avatar_uploads WHERE id=? AND state='stored')`,
        )
        .bind(
          crypto.randomUUID(),
          now,
          now,
          now,
          upload.user_id,
          upload.expected_profile_version,
          upload.id,
        ),
      db
        .prepare(
          `UPDATE users SET avatar_object_key=?,profile_version=profile_version+1,updated_at=MAX(updated_at,?)
        WHERE id=? AND profile_version=? AND EXISTS(SELECT 1 FROM avatar_uploads WHERE id=? AND state='stored')`,
        )
        .bind(
          upload.object_key,
          now,
          upload.user_id,
          upload.expected_profile_version,
          upload.id,
        ),
      db
        .prepare('INSERT INTO transaction_guards(id,ok) VALUES (?,changes()=1)')
        .bind(guard),
      db
        .prepare(
          "UPDATE avatar_uploads SET state='committed',updated_at=? WHERE id=? AND state='stored'",
        )
        .bind(now, upload.id),
      db.prepare('DELETE FROM transaction_guards WHERE id=?').bind(guard),
    ]);
  } catch {
    const current = await db
      .prepare('SELECT * FROM avatar_uploads WHERE id=?')
      .bind(upload.id)
      .first<Upload>();
    if (current?.state === 'committed') return;
    const user = await db
      .prepare('SELECT profile_version AS version FROM users WHERE id=?')
      .bind(upload.user_id)
      .first<{ version: number }>();
    if (
      current?.state === 'failed' ||
      user?.version !== upload.expected_profile_version
    ) {
      await db.batch([
        db
          .prepare(
            "UPDATE avatar_uploads SET state='failed',last_error='PROFILE_CONFLICT',updated_at=? WHERE id=? AND state IN ('pending','stored')",
          )
          .bind(now, upload.id),
        queueCleanup(db, upload.object_key, 'failed', now),
      ]);
      throw conflict();
    }
    throw new MediaError('MEDIA_UNCONFIRMED', 503);
  }
}
export async function putAvatar(
  env: MediaEnv,
  userId: string,
  key: string,
  version: number,
  bytes: ArrayBuffer,
  now = Math.floor(Date.now() / 1000),
) {
  await validateWebp(bytes);
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  const objectKey = `avatars/${crypto.randomUUID()}.webp`;
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO avatar_uploads(id,user_id,idempotency_key,file_hash,object_key,content_type,size_bytes,width,height,expected_profile_version,state,created_at,updated_at)
    VALUES (?,?,?,?,?,'image/webp',?,512,512,?,'pending',?,?)`,
  )
    .bind(
      crypto.randomUUID(),
      userId,
      key,
      hash,
      objectKey,
      bytes.byteLength,
      version,
      now,
      now,
    )
    .run();
  const upload = await env.DB.prepare(
    'SELECT * FROM avatar_uploads WHERE user_id=? AND idempotency_key=?',
  )
    .bind(userId, key)
    .first<Upload>();
  if (!upload) throw new MediaError('MEDIA_UNCONFIRMED', 503);
  if (upload.file_hash !== hash || upload.expected_profile_version !== version)
    throw new MediaError('IDEMPOTENCY_CONFLICT', 409);
  if (upload.state === 'committed') return;
  if (upload.state === 'failed') throw conflict();
  if (upload.state === 'pending') {
    if (inserted.meta.changes === 1) {
      try {
        await env.AVATARS.put(upload.object_key, bytes, {
          httpMetadata: { contentType: 'image/webp' },
          sha256: hash,
        });
      } catch {
        throw new MediaError('MEDIA_UNCONFIRMED', 503);
      }
    } else if (!(await env.AVATARS.head(upload.object_key))) {
      // Only the insertion winner can write this key. A crashed attempt is retired by reconciliation.
      throw new MediaError('UPLOAD_PENDING', 409);
    }
    await env.DB.prepare(
      "UPDATE avatar_uploads SET state='stored',updated_at=? WHERE id=? AND state='pending'",
    )
      .bind(now, upload.id)
      .run();
  }
  await finalize(env, upload, now);
}
export async function deleteAvatar(
  env: MediaEnv,
  userId: string,
  version: number,
  now = Math.floor(Date.now() / 1000),
) {
  const guard = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO media_cleanup_jobs(id,object_key,reason,state,attempts,next_attempt_at,created_at,updated_at)
        SELECT ?,avatar_object_key,'removed','pending',0,?,?,? FROM users WHERE id=? AND profile_version=? AND avatar_object_key IS NOT NULL`,
      ).bind(crypto.randomUUID(), now, now, now, userId, version),
      env.DB.prepare(
        'UPDATE users SET avatar_object_key=NULL,profile_version=profile_version+1,updated_at=MAX(updated_at,?) WHERE id=? AND profile_version=?',
      ).bind(now, userId, version),
      env.DB.prepare(
        'INSERT INTO transaction_guards(id,ok) VALUES (?,changes()=1)',
      ).bind(guard),
      env.DB.prepare('DELETE FROM transaction_guards WHERE id=?').bind(guard),
    ]);
  } catch {
    const user = await env.DB.prepare(
      'SELECT profile_version AS version FROM users WHERE id=?',
    )
      .bind(userId)
      .first<{ version: number }>();
    if (user?.version !== version) throw conflict();
    throw new MediaError('MEDIA_UNCONFIRMED', 503);
  }
}
