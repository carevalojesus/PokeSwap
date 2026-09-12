import type { AccountProfile } from '../../shared/contracts/auth';
import { limaDate } from '../registration/input';

export function ageOnDate(birthDate: string, today: string): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const [year, month, day] = today.split('-').map(Number);
  return (
    year -
    birthYear -
    Number(month < birthMonth || (month === birthMonth && day < birthDay))
  );
}

export async function getPrivateProfile(
  db: D1Database,
  userId: string,
  now = new Date(),
): Promise<AccountProfile | null> {
  const user = await db
    .prepare(
      `SELECT id,senati_id AS senatiId,first_names AS firstNames,last_names AS lastNames,
    birth_date AS birthDate,trainer_name AS trainerName,role,profile_version AS profileVersion,
    CASE WHEN avatar_object_key IS NULL THEN NULL ELSE '/api/users/' || id || '/avatar' END AS avatarUrl
    FROM users WHERE id=?`,
    )
    .bind(userId)
    .first<{
      id: string;
      senatiId: string;
      firstNames: string;
      lastNames: string;
      birthDate: string;
      trainerName: string;
      role: 'student' | 'teacher';
      profileVersion: number;
      avatarUrl: string | null;
    }>();
  if (!user) return null;
  const initial = await db
    .prepare(
      `SELECT p.id AS instanceId,p.species_id AS speciesId,g.probabilities_version AS probabilitiesVersion
    FROM reward_grants g JOIN pokemon_instances p ON p.grant_id=g.id AND p.grant_slot=0
    WHERE g.user_id=? AND g.kind='initial'`,
    )
    .bind(userId)
    .first<{
      instanceId: string;
      speciesId: number;
      probabilitiesVersion: number;
    }>();
  return {
    user: { ...user, age: ageOnDate(user.birthDate, limaDate(now)) },
    initial,
  };
}
