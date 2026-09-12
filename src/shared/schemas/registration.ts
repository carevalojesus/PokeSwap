export interface RegistrationInput {
  senatiId: string;
  firstNames: string;
  lastNames: string;
  birthDate: string;
  password: string;
}

export class InvalidRegistration extends Error {
  constructor(
    readonly field: keyof RegistrationInput | 'body',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidRegistration';
  }
}

const length = (value: string) => [...value].length;
const forbidden = /\p{C}/u;
const fields = [
  'senatiId',
  'firstNames',
  'lastNames',
  'birthDate',
  'password',
] as const;

export function limaDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function normalizeSenatiId(value: string): string {
  if (forbidden.test(value)) {
    throw new InvalidRegistration(
      'senatiId',
      'El ID no admite caracteres de control.',
    );
  }
  const id = value.normalize('NFC').trim().toUpperCase().normalize('NFC');
  if (
    length(id) < 1 ||
    length(id) > 32 ||
    /\s/u.test(id) ||
    forbidden.test(id)
  ) {
    throw new InvalidRegistration(
      'senatiId',
      'El ID debe tener entre 1 y 32 caracteres, sin espacios internos ni caracteres de control.',
    );
  }
  return id;
}

export function parseRegistration(
  value: unknown,
  now = new Date(),
): RegistrationInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidRegistration(
      'body',
      'Se requieren los datos de registro.',
    );
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !fields.includes(key as (typeof fields)[number]),
    )
  ) {
    throw new InvalidRegistration(
      'body',
      'El registro contiene campos no admitidos.',
    );
  }
  for (const field of fields) {
    if (!Object.hasOwn(body, field) || typeof body[field] !== 'string') {
      throw new InvalidRegistration(
        field,
        'Este campo es obligatorio y debe ser texto.',
      );
    }
    // Bound work before normalization; the eventual HTTP adapter also limits bytes.
    if ((body[field] as string).length > 1024) {
      throw new InvalidRegistration(field, 'El campo es demasiado largo.');
    }
  }
  const input = body as unknown as RegistrationInput;
  const senatiId = normalizeSenatiId(input.senatiId);
  const normalizeName = (field: 'firstNames' | 'lastNames') => {
    if (forbidden.test(input[field]))
      throw new InvalidRegistration(
        field,
        'El nombre contiene caracteres de control.',
      );
    const name = input[field].normalize('NFC').trim().replace(/\s+/gu, ' ');
    if (length(name) < 1 || length(name) > 100)
      throw new InvalidRegistration(field, 'Escribe entre 1 y 100 caracteres.');
    return name;
  };
  const firstNames = normalizeName('firstNames');
  const lastNames = normalizeName('lastNames');
  const birthDate = input.birthDate;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match)
    throw new InvalidRegistration(
      'birthDate',
      'Usa una fecha válida YYYY-MM-DD.',
    );
  const [, year, month, day] = match.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1] ||
    birthDate > limaDate(now)
  ) {
    throw new InvalidRegistration(
      'birthDate',
      'La fecha debe existir y no estar en el futuro.',
    );
  }
  // Do not trim, truncate or normalize passwords: verification uses identical bytes.
  const password = input.password;
  if (
    length(password) < 15 ||
    length(password) > 128 ||
    /[\p{Cc}\p{Cs}]/u.test(password) ||
    new TextEncoder().encode(password).length > 1024
  ) {
    throw new InvalidRegistration(
      'password',
      'Usa una contraseña de 15 a 128 caracteres, sin caracteres de control.',
    );
  }
  return { senatiId, firstNames, lastNames, birthDate, password };
}
