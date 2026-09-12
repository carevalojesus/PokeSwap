import { type MediaEnv, queueCleanup } from './service';

// Failed and previously committed uploads can never be attached again by the API.
async function disposable(env: MediaEnv, key: string) {
  const row = await env.DB.prepare(
    `SELECT a.state,EXISTS(SELECT 1 FROM users WHERE avatar_object_key=a.object_key) AS referenced
    FROM avatar_uploads a WHERE object_key=?`,
  )
    .bind(key)
    .first<{ state: string; referenced: number }>();
  return (
    !row || (!row.referenced && ['failed', 'committed'].includes(row.state))
  );
}
export async function reconcileMedia(
  env: MediaEnv,
  now = Math.floor(Date.now() / 1000),
) {
  const stale = await env.DB.prepare(
    "SELECT id,object_key FROM avatar_uploads WHERE state IN ('pending','stored') AND updated_at<? ORDER BY updated_at LIMIT 50",
  )
    .bind(now - 3600)
    .all<{ id: string; object_key: string }>();
  for (const upload of stale.results) {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE avatar_uploads SET state='failed',last_error='ABANDONED',updated_at=? WHERE id=? AND state IN ('pending','stored') AND updated_at<? AND NOT EXISTS(SELECT 1 FROM users WHERE avatar_object_key=?)",
      ).bind(now, upload.id, now - 3600, upload.object_key),
      queueCleanup(env.DB, upload.object_key, 'abandoned', now),
    ]);
  }
  const jobs = await env.DB.prepare(
    "SELECT id,object_key FROM media_cleanup_jobs WHERE (state='pending' AND next_attempt_at<=?) OR (state='processing' AND lease_expires_at<=?) ORDER BY next_attempt_at LIMIT 50",
  )
    .bind(now, now)
    .all<{ id: string; object_key: string }>();
  for (const job of jobs.results) {
    const claimed = await env.DB.prepare(
      "UPDATE media_cleanup_jobs SET state='processing',lease_expires_at=?,updated_at=?,attempts=attempts+1 WHERE id=? AND ((state='pending' AND next_attempt_at<=?) OR (state='processing' AND lease_expires_at<=?)) RETURNING id",
    )
      .bind(now + 300, now, job.id, now, now)
      .first();
    if (!claimed) continue;
    try {
      if (!(await disposable(env, job.object_key))) {
        await env.DB.prepare(
          "UPDATE media_cleanup_jobs SET state='pending',lease_expires_at=NULL,next_attempt_at=?,updated_at=? WHERE id=? AND lease_expires_at=?",
        )
          .bind(now + 3600, now, job.id, now + 300)
          .run();
        continue;
      }
      await env.AVATARS.delete(job.object_key);
      await env.DB.prepare(
        "UPDATE media_cleanup_jobs SET state='completed',lease_expires_at=NULL,last_error=NULL,updated_at=? WHERE id=? AND lease_expires_at=?",
      )
        .bind(now, job.id, now + 300)
        .run();
    } catch {
      await env.DB.prepare(
        "UPDATE media_cleanup_jobs SET state='pending',lease_expires_at=NULL,last_error='DELETE_FAILED',next_attempt_at=?,updated_at=? WHERE id=? AND lease_expires_at=?",
      )
        .bind(now + 900, now, job.id, now + 300)
        .run();
    }
  }
  // A put can finish after its request was abandoned and after cleanup ran. Sweep
  // the bucket in persistent pages as well, so those late orphan writes are found.
  const checkpoint = await env.DB.prepare(
    "SELECT cursor FROM media_sweep_state WHERE id='avatars'",
  ).first<{ cursor: string | null }>();
  const page = await env.AVATARS.list({
    prefix: 'avatars/',
    limit: 100,
    cursor: checkpoint?.cursor ?? undefined,
  });
  for (const object of page.objects) {
    if (
      object.uploaded.getTime() / 1000 < now - 3600 &&
      (await disposable(env, object.key))
    )
      await env.AVATARS.delete(object.key);
  }
  await env.DB.prepare(
    "INSERT INTO media_sweep_state(id,cursor) VALUES ('avatars',?) ON CONFLICT(id) DO UPDATE SET cursor=excluded.cursor",
  )
    .bind(page.truncated ? page.cursor : null)
    .run();
}
