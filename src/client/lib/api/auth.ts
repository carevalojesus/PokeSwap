import type { ProfileUpdate } from '../../../shared/schemas/profile';
import { authenticatedProfileSchema } from '../../../shared/schemas/auth';
import type { AuthenticatedProfile } from '../../../shared/contracts/auth';
import type { LoginInput } from '../../../shared/schemas/auth';
import type { RegistrationInput } from '../../../shared/schemas/registration';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly field?: string,
    readonly retryAfter?: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

async function request(path: string, options: RequestInit = {}) {
  try {
    const timeout = AbortSignal.timeout(15_000);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    const response = await fetch(path, {
      ...options,
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const data =
        body && typeof body === 'object'
          ? (body as Record<string, unknown>)
          : {};
      const retry = Number(response.headers.get('Retry-After'));
      throw new ApiError(
        typeof data.code === 'string'
          ? data.code
          : response.status === 401
            ? 'UNAUTHENTICATED'
            : 'HTTP_ERROR',
        typeof data.field === 'string' ? data.field : undefined,
        response.status === 429
          ? Math.min(Math.max(retry || 60, 1), 3600)
          : undefined,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof ApiError || options.signal?.aborted) throw error;
    throw new ApiError('NETWORK_ERROR');
  }
}

async function profile(response: Response): Promise<AuthenticatedProfile> {
  const body: unknown = await response.json().catch(() => null);
  const result = authenticatedProfileSchema.safeParse(body);
  if (!result.success) throw new ApiError('INVALID_RESPONSE');
  if (result.data.session.expiresAt * 1000 <= Date.now())
    throw new ApiError('INVALID_RESPONSE');
  return result.data;
}
export async function getSession(
  signal: AbortSignal,
): Promise<AuthenticatedProfile | null> {
  try {
    return await profile(await request('/api/me', { signal }));
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED')
      return null;
    throw error;
  }
}
export async function authenticate(
  kind: 'login' | 'register',
  input: LoginInput | RegistrationInput,
) {
  return profile(
    await request(`/api/auth/${kind}`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}
export async function revokeSession() {
  const response = await request('/api/auth/logout', {
    method: 'POST',
    body: '{}',
  });
  if (response.status !== 204) throw new ApiError('INVALID_RESPONSE');
}

export function authErrorMessage(error: unknown, register = false): string {
  if (!(error instanceof ApiError))
    return 'No pudimos completar la solicitud. Inténtalo de nuevo.';
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return 'ID o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.';
    case 'SESSION_NOT_CONFIRMED':
      return 'El acceso no quedó confirmado. Permite las cookies de este sitio y vuelve a iniciar sesión.';
    case 'ACCOUNT_EXISTS':
      return 'Este ID ya tiene una cuenta. Inicia sesión para recuperar tu mismo Pokémon inicial.';
    case 'SESSION_START_FAILED':
      return 'Tu cuenta fue creada, pero no pudimos iniciar la sesión. Ingresa con el mismo ID y contraseña para recuperar tu inicial.';
    case 'RATE_LIMITED':
      return `Demasiados intentos. Espera ${error.retryAfter ?? 60} segundos antes de volver a intentarlo.`;
    case 'INVALID_INPUT':
      return 'Revisa los datos del formulario. El servidor no pudo validarlos.';
    case 'ALIAS_UNAVAILABLE':
      return 'No pudimos asignarte un nombre de entrenador. Vuelve a intentarlo.';
    case 'INVALID_ORIGIN':
      return 'No pudimos validar el origen de la solicitud. Abre PokéSwap desde su dirección oficial.';
    default:
      return register
        ? 'No pudimos confirmar el registro. La cuenta podría haberse creado: inicia sesión con el mismo ID y contraseña antes de volver a registrarte.'
        : 'No pudimos confirmar el acceso. Revisa tu conexión y vuelve a intentarlo.';
  }
}

export async function patchProfile(input: ProfileUpdate, signal: AbortSignal) {
  return profile(
    await request('/api/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
      signal,
    }),
  );
}

export type AvatarMutation =
  | { kind: 'put'; blob: Blob; key: string; version: number }
  | { kind: 'delete'; version: number };
export async function mutateAvatar(input: AvatarMutation, signal: AbortSignal) {
  return profile(
    await request('/api/me/avatar', {
      method: input.kind === 'put' ? 'PUT' : 'DELETE',
      signal,
      headers: {
        'X-Profile-Version': String(input.version),
        ...(input.kind === 'put'
          ? { 'Content-Type': 'image/webp', 'Idempotency-Key': input.key }
          : {}),
      },
      body: input.kind === 'put' ? await input.blob.arrayBuffer() : undefined,
    }),
  );
}
