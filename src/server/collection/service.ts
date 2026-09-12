import { collectionSchema } from '../../shared/schemas/collection';

// One statement gives counts and deadlines from the same database snapshot.
// Expired/closed reservations are not available for reuse until a future trade
// mutation releases their rows atomically; this read never mutates game state.
export async function getCollection(
  db: D1Database,
  userId: string,
  now = Math.floor(Date.now() / 1000),
) {
  const { results } = await db
    .prepare(
      `
    WITH owned AS (
      SELECT i.species_id, i.is_protected,
        CASE WHEN i.is_protected = 0 AND r.user_id = i.owner_id
          AND r.expires_at > ? AND t.state IN ('open','pending')
          AND (CASE WHEN t.state = 'open' THEN t.offer_expires_at ELSE t.proposal_expires_at END) > ?
        THEN min(r.expires_at, CASE WHEN t.state = 'open' THEN t.offer_expires_at ELSE t.proposal_expires_at END)
        ELSE NULL END AS reserved_until
      FROM pokemon_instances i
      LEFT JOIN trade_reservations r ON r.instance_id = i.id
      LEFT JOIN trades t ON t.id = r.trade_id
      WHERE i.owner_id = ?
    )
    SELECT species_id AS speciesId, count(*) AS total,
      sum(is_protected) AS protected, count(reserved_until) AS reserved,
      count(*) - sum(is_protected) - count(reserved_until) AS available,
      min(reserved_until) AS deadline
    FROM owned GROUP BY species_id ORDER BY species_id
  `,
    )
    .bind(now, now, userId)
    .all<{
      speciesId: number;
      total: number;
      protected: number;
      reserved: number;
      available: number;
      deadline: number | null;
    }>();
  const deadlines = results.flatMap((s) =>
    s.deadline === null ? [] : [s.deadline],
  );
  return collectionSchema.parse({
    userId,
    species: results.map((s) => ({
      speciesId: s.speciesId,
      total: s.total,
      protected: s.protected,
      reserved: s.reserved,
      available: s.available,
    })),
    goal: 150,
    obtained: results.filter((s) => s.speciesId <= 150).length,
    total: results.reduce((n, s) => n + s.total, 0),
    reserved: results.reduce((n, s) => n + s.reserved, 0),
    available: results.reduce((n, s) => n + s.available, 0),
    nextRefreshAt: deadlines.length ? Math.min(...deadlines) : null,
  });
}
