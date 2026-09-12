import { tokenHash } from '../auth/session';
import { drawPokemon } from '../game/draw';
import { rewardSchema, type Drop } from '../../shared/schemas/drops';

export class DropError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 503,
  ) {
    super(code);
  }
}
type Row = {
  id: string;
  creatorId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  cancelledAt: number | null;
  redemptions: number;
  state: Drop['state'];
};
const selectDrop = `SELECT d.id,d.creator_id AS creatorId,d.token_hash AS tokenHash,d.created_at AS createdAt,d.expires_at AS expiresAt,d.cancelled_at AS cancelledAt,
 (SELECT count(*) FROM reward_grants g WHERE g.drop_id=d.id) AS redemptions,
 CASE WHEN d.cancelled_at IS NOT NULL THEN 'cancelled' WHEN d.expires_at<=unixepoch() THEN 'expired' ELSE 'active' END AS state FROM poke_drops d`;
export function publicDrop(row: Row): Drop {
  return {
    id: row.id,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    cancelledAt: row.cancelledAt,
    redemptions: row.redemptions,
    state: row.state,
  };
}

// Recoverable sharing without storing raw bearer codes in D1. The key is a
// per-environment Worker secret; IDs alone never authorize a student redemption.
export async function sharingCode(
  secret: string | undefined,
  creatorId: string,
  id: string,
) {
  if (!secret || !/^[a-f0-9]{64}$/.test(secret))
    throw new DropError('DROP_CONFIGURATION', 503);
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(secret.match(/../g)!, (b) => parseInt(b, 16)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`pokeswap-drop:v1:${creatorId}:${id}`),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function ownedDrop(db: D1Database, owner: string, id: string) {
  const row = await db
    .prepare(`${selectDrop} WHERE d.id=? AND d.creator_id=?`)
    .bind(id, owner)
    .first<Row>();
  if (!row) throw new DropError('DROP_NOT_FOUND', 404);
  return row;
}
export async function detail(
  db: D1Database,
  secret: string | undefined,
  owner: string,
  id: string,
) {
  const row = await ownedDrop(db, owner, id);
  const code = await sharingCode(secret, owner, id);
  return {
    userId: owner,
    drop: publicDrop(row),
    code: (await tokenHash(code)) === row.tokenHash ? code : null,
  };
}
export async function listDrops(db: D1Database, owner: string) {
  const { results } = await db
    .prepare(
      `${selectDrop} WHERE d.creator_id=? ORDER BY d.created_at DESC,d.id DESC LIMIT 50`,
    )
    .bind(owner)
    .all<Row>();
  return { userId: owner, drops: results.map(publicDrop) };
}
export async function createDrop(
  db: D1Database,
  secret: string | undefined,
  owner: string,
  input: { id: string; minutes: number },
) {
  const code = await sharingCode(secret, owner, input.id);
  const hash = await tokenHash(code);
  await db
    .prepare(
      `INSERT INTO poke_drops (id,creator_id,token_hash,created_at,expires_at)
    SELECT ?,id,?,unixepoch(),unixepoch()+? FROM users WHERE id=? AND role='teacher'
    ON CONFLICT(id) DO NOTHING`,
    )
    .bind(input.id, hash, input.minutes * 60, owner)
    .run();
  const row = await ownedDrop(db, owner, input.id);
  if (
    row.tokenHash !== hash ||
    row.expiresAt - row.createdAt !== input.minutes * 60
  )
    throw new DropError('DROP_CONFLICT', 409);
  return { userId: owner, drop: publicDrop(row), code };
}
export async function cancelDrop(db: D1Database, owner: string, id: string) {
  await ownedDrop(db, owner, id);
  await db
    .prepare(
      `UPDATE poke_drops SET cancelled_at=unixepoch(),version=version+1
    WHERE id=? AND creator_id=? AND cancelled_at IS NULL AND expires_at>unixepoch()
      AND EXISTS(SELECT 1 FROM users WHERE id=? AND role='teacher')`,
    )
    .bind(id, owner, owner)
    .run();
  return { userId: owner, drop: publicDrop(await ownedDrop(db, owner, id)) };
}
async function byCode(db: D1Database, code: string) {
  const row = await db
    .prepare(`${selectDrop} WHERE d.token_hash=?`)
    .bind(await tokenHash(code))
    .first<Row>();
  if (!row) throw new DropError('DROP_NOT_FOUND', 404);
  return row;
}
export async function getReward(
  db: D1Database,
  userId: string,
  dropId: string,
) {
  const { results } = await db
    .prepare(
      `SELECT g.id,g.drop_id AS dropId,g.user_id AS userId,g.created_at AS createdAt,g.probabilities_version AS probabilitiesVersion,
    i.id AS instanceId,i.species_id AS speciesId,i.grant_slot AS slot
    FROM reward_grants g LEFT JOIN pokemon_instances i ON i.grant_id=g.id WHERE g.user_id=? AND g.drop_id=? ORDER BY i.grant_slot`,
    )
    .bind(userId, dropId)
    .all<{
      id: string;
      dropId: string;
      userId: string;
      createdAt: number;
      probabilitiesVersion: number;
      instanceId: string;
      speciesId: number;
      slot: number;
    }>();
  if (!results.length) return null;
  const first = results[0];
  return rewardSchema.parse({
    id: first.id,
    dropId: first.dropId,
    userId: first.userId,
    createdAt: first.createdAt,
    probabilitiesVersion: first.probabilitiesVersion,
    instances: results.map((i) => ({
      instanceId: i.instanceId,
      speciesId: i.speciesId,
      slot: i.slot,
    })),
  });
}
export async function previewDrop(
  db: D1Database,
  userId: string,
  code: string,
) {
  const row = await byCode(db, code);
  const drop = publicDrop(row);
  return {
    userId,
    drop: {
      id: drop.id,
      createdAt: drop.createdAt,
      expiresAt: drop.expiresAt,
      cancelledAt: drop.cancelledAt,
      state: drop.state,
    },
    reward: await getReward(db, userId, row.id),
  };
}
export async function redeemDrop(
  db: D1Database,
  userId: string,
  code: string,
  draw = drawPokemon,
) {
  const row = await byCode(db, code);
  const existing = await getReward(db, userId, row.id);
  if (existing) return existing;
  const grant = crypto.randomUUID(),
    guard = crypto.randomUUID();
  const draws = [draw(), draw(), draw()];
  const statements = [
    db
      .prepare(
        `INSERT INTO reward_grants (id,user_id,kind,drop_id,draw_count,probabilities_version,created_at)
    SELECT ?,u.id,'drop',d.id,3,?,unixepoch() FROM poke_drops d JOIN users u ON u.id=?
    WHERE d.id=? AND d.token_hash=? AND d.cancelled_at IS NULL AND d.expires_at>unixepoch() AND u.role='student'`,
      )
      .bind(
        grant,
        draws[0].probabilitiesVersion,
        userId,
        row.id,
        row.tokenHash,
      ),
    db
      .prepare('INSERT INTO transaction_guards (id,ok) VALUES (?,changes()=1)')
      .bind(guard),
  ];
  for (const [slot, result] of draws.entries()) {
    const instance = crypto.randomUUID();
    statements.push(
      db
        .prepare(
          `INSERT INTO pokemon_instances (id,species_id,owner_id,grant_id,grant_slot,is_protected,created_at,acquired_at)
      SELECT ?,?,user_id,id,?,CASE WHEN EXISTS(SELECT 1 FROM pokemon_instances WHERE owner_id=? AND species_id=? AND is_protected=1) THEN 0 ELSE 1 END,created_at,created_at FROM reward_grants WHERE id=?`,
        )
        .bind(
          instance,
          result.speciesId,
          slot,
          userId,
          result.speciesId,
          grant,
        ),
      db
        .prepare(
          `INSERT INTO instance_events (id,instance_id,instance_version,kind,to_user_id,grant_id,created_at)
        SELECT ?,id,0,'issued',owner_id,grant_id,created_at FROM pokemon_instances WHERE id=?`,
        )
        .bind(crypto.randomUUID(), instance),
    );
  }
  statements.push(
    db.prepare('DELETE FROM transaction_guards WHERE id=?').bind(guard),
  );
  try {
    await db.batch(statements);
  } catch (error) {
    // An uncertain response or a unique-index race recovers the winner, even
    // after expiry/cancellation. Never re-roll an already committed reward.
    const saved = await getReward(db, userId, row.id);
    if (saved) return saved;
    const current = await byCode(db, code);
    if (current.state !== 'active') throw new DropError('DROP_INACTIVE', 409);
    throw error;
  }
  const saved = await getReward(db, userId, row.id);
  if (!saved) throw new DropError('DROP_UNCONFIRMED', 503);
  return saved;
}
