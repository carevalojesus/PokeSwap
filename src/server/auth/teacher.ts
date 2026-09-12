import { hashPassword } from './password';
import { parseRegistration } from '../registration/input';
import { generateTrainerName } from '../registration/trainer-name';

// Operator-only provisioning. This module is never imported by HTTP routes.
// A conflicting ID fails; it never promotes or overwrites an existing student.
export async function prepareTeacherInsert(input: unknown, now = new Date()) {
  const data = parseRegistration(input, now);
  const trainer = generateTrainerName();
  const passwordHash = await hashPassword(data.password);
  const userId = crypto.randomUUID();
  const seconds = Math.floor(now.getTime() / 1000);
  const values = [
    userId,
    data.senatiId,
    data.firstNames,
    data.lastNames,
    data.birthDate,
    trainer.name,
    trainer.key,
    trainer.version,
    passwordHash,
    'teacher',
    seconds,
    seconds,
  ];
  // SQL literals are required for Wrangler's operator-only SQL file interface.
  const literal = (value: string | number) =>
    typeof value === 'number'
      ? String(value)
      : `'${value.replaceAll("'", "''")}'`;
  const sql = `INSERT INTO users (id,senati_id,first_names,last_names,birth_date,trainer_name,trainer_name_key,trainer_name_version,password_hash,role,created_at,updated_at) VALUES (${values.map(literal).join(',')});\n`;
  return { userId, senatiId: data.senatiId, trainerName: trainer.name, sql };
}
