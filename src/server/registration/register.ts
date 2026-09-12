import { hashPassword } from '../auth/password';
import { drawPokemon } from '../game/draw';
import { generateTrainerName } from './trainer-name';
import { parseRegistration } from './input';

export class RegistrationConflict extends Error {
  constructor() {
    super(
      'Este ID ya está registrado. Inicia sesión para recuperar tu cuenta.',
    );
    this.name = 'RegistrationConflict';
  }
}
export class TrainerNameUnavailable extends Error {
  constructor() {
    super('No se pudo generar un nombre disponible. Inténtalo nuevamente.');
    this.name = 'TrainerNameUnavailable';
  }
}

const MAX_NAME_ATTEMPTS = 5;

// Dependency overrides are for internal tests only, never request parameters.
export function createRegistrationService(
  database: D1Database,
  dependencies = {
    hashPassword,
    drawPokemon,
    generateTrainerName,
    now: () => new Date(),
  },
) {
  return async function register(input: unknown) {
    const now = dependencies.now();
    const data = parseRegistration(input, now);
    const existing = await database
      .prepare('SELECT id FROM users WHERE senati_id = ?')
      .bind(data.senatiId)
      .first();
    if (existing) throw new RegistrationConflict();
    const passwordHash = await dependencies.hashPassword(data.password);
    const userId = crypto.randomUUID();
    const grantId = crypto.randomUUID();
    const instanceId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const createdAt = Math.floor(now.getTime() / 1000);
    // Keep the same draw across alias collision retries; no reroll advantage.
    const draw = dependencies.drawPokemon();
    for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
      const trainer = dependencies.generateTrainerName();
      try {
        await database.batch([
          database
            .prepare(
              `INSERT INTO users
            (id, senati_id, first_names, last_names, birth_date, trainer_name, trainer_name_key,
             trainer_name_version, password_hash, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'student', ?, ?)`,
            )
            .bind(
              userId,
              data.senatiId,
              data.firstNames,
              data.lastNames,
              data.birthDate,
              trainer.name,
              trainer.key,
              trainer.version,
              passwordHash,
              createdAt,
              createdAt,
            ),
          database
            .prepare(
              `INSERT INTO reward_grants
            (id, user_id, kind, draw_count, probabilities_version, created_at)
            VALUES (?, ?, 'initial', 1, ?, ?)`,
            )
            .bind(grantId, userId, draw.probabilitiesVersion, createdAt),
          database
            .prepare(
              `INSERT INTO pokemon_instances
            (id, species_id, owner_id, grant_id, grant_slot, is_protected, version, created_at, acquired_at)
            VALUES (?, ?, ?, ?, 0, 1, 0, ?, ?)`,
            )
            .bind(
              instanceId,
              draw.speciesId,
              userId,
              grantId,
              createdAt,
              createdAt,
            ),
          database
            .prepare(
              `INSERT INTO instance_events
            (id, instance_id, instance_version, kind, to_user_id, grant_id, created_at)
            VALUES (?, ?, 0, 'issued', ?, ?, ?)`,
            )
            .bind(eventId, instanceId, userId, grantId, createdAt),
        ]);
        return {
          userId,
          trainerName: trainer.name,
          initial: {
            instanceId,
            speciesId: draw.speciesId,
            probabilitiesVersion: draw.probabilitiesVersion,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('UNIQUE constraint failed: users.senati_id'))
          throw new RegistrationConflict();
        if (
          !message.includes('UNIQUE constraint failed: users.trainer_name_key')
        )
          throw error;
        // The unique index, not the preflight read, settles concurrent requests.
        const duplicate = await database
          .prepare('SELECT id FROM users WHERE senati_id = ?')
          .bind(data.senatiId)
          .first();
        if (duplicate) throw new RegistrationConflict();
      }
    }
    throw new TrainerNameUnavailable();
  };
}
