import { dropCodeSchema } from '../../../shared/schemas/drops';

export function dropLink(code: string, origin = window.location.origin) {
  return `${origin}/pokedrop#${dropCodeSchema.parse(code)}`;
}

/** Accept only a code or our exact sharing URL; never navigate scanned input. */
export function parseDropInput(
  input: string,
  origin = window.location.origin,
): string | null {
  const plain = dropCodeSchema.safeParse(input);
  if (plain.success) return plain.data;
  try {
    const url = new URL(input.trim());
    if (
      url.origin !== origin ||
      !['https:', 'http:'].includes(url.protocol) ||
      url.pathname !== '/pokedrop' ||
      url.search ||
      url.username ||
      url.password
    )
      return null;
    const code = dropCodeSchema.safeParse(url.hash.slice(1));
    return code.success ? code.data : null;
  } catch {
    return null;
  }
}
