import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { prepareTeacherInsert } from '../src/server/auth/teacher';

const args = process.argv.slice(2);
const environments = args.filter((arg) =>
  ['--local', '--test', '--production'].includes(arg),
);
const inputFlag = args.indexOf('--input');
if (
  environments.length !== 1 ||
  inputFlag === -1 ||
  !args[inputFlag + 1] ||
  args.length !== 3
) {
  throw new Error(
    'Uso: npm run teacher:create -- --local|--test|--production --input /ruta/privada/docente.json',
  );
}
const environment = environments[0];
const input: unknown = JSON.parse(
  await readFile(resolve(args[inputFlag + 1]), 'utf8'),
);
if (
  !input ||
  typeof input !== 'object' ||
  Array.isArray(input) ||
  Object.keys(input).some(
    (key) =>
      !['senatiId', 'firstNames', 'lastNames', 'birthDate'].includes(key),
  )
) {
  throw new Error(
    'El archivo admite solo senatiId, firstNames, lastNames y birthDate.',
  );
}
const password = randomBytes(24).toString('base64url');
const teacher = await prepareTeacherInsert({ ...input, password });
const root = resolve('.local');
await mkdir(root, { recursive: true, mode: 0o700 });
const directory = await mkdtemp(join(root, 'teacher-'));
const credentialsPath = join(directory, 'credentials.json');
const sqlPath = join(directory, 'provision.sql');
const credentials = {
  environment,
  senatiId: teacher.senatiId,
  password,
  userId: teacher.userId,
  trainerName: teacher.trainerName,
  status: 'pending',
};
await writeFile(credentialsPath, JSON.stringify(credentials, null, 2) + '\n', {
  mode: 0o600,
  flag: 'wx',
});
await writeFile(sqlPath, teacher.sql, { mode: 0o600, flag: 'wx' });
const flags =
  environment === '--local'
    ? ['--local']
    : environment === '--test'
      ? ['--env', 'test', '--remote']
      : ['--remote'];
try {
  const success = await new Promise<boolean>((resolveResult, reject) => {
    const child = spawn(
      resolve('node_modules/.bin/wrangler'),
      ['d1', 'execute', 'DB', ...flags, '--file', sqlPath, '--json'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      },
    );
    // Do not echo SQL, personal data or credentials into terminal/CI logs.
    child.stdout.resume();
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) => resolveResult(code === 0));
  });
  if (!success)
    throw new Error(
      `No se confirmó la creación. Revisa la base antes de reintentar; credenciales pendientes: ${credentialsPath}`,
    );
  await writeFile(
    credentialsPath,
    JSON.stringify({ ...credentials, status: 'created' }, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(
    `Cuenta docente creada. Credenciales privadas: ${credentialsPath}`,
  );
} finally {
  await rm(sqlPath, { force: true });
}
