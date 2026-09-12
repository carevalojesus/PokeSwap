import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useSession } from '../auth/session-context';
import { ApiError, request } from '../../lib/api/auth';
import type { AuthenticatedProfile } from '../../../shared/contracts/auth';

export async function dropRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  signal: AbortSignal,
  body?: unknown,
): Promise<T> {
  const response = await request(path, {
    signal,
    ...(body === undefined
      ? {}
      : { method: 'POST', body: JSON.stringify(body) }),
  });
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new ApiError('INVALID_RESPONSE');
  return parsed.data;
}
export function useDropAction() {
  const { profile } = useSession();
  const client = useQueryClient();
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  async function run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    accept: (value: T) => void,
  ) {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError('');
    const id = profile?.user.id;
    try {
      const result = await operation(active.signal);
      if (
        active.signal.aborted ||
        client.getQueryData<AuthenticatedProfile>(['private', 'session'])?.user
          .id !== id
      )
        return;
      accept(result);
    } catch (error) {
      if (active.signal.aborted) return;
      if (
        error instanceof ApiError &&
        ['UNAUTHENTICATED', 'SESSION_CHANGED'].includes(error.code)
      )
        client.setQueryData(['private', 'session'], null);
      else setError(dropError(error));
    } finally {
      if (!active.signal.aborted) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  return { busy, error, run };
}
export function dropError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'DROP_NOT_FOUND')
      return 'No encontramos ese PokéDrop. Revisa el código.';
    if (error.code === 'DROP_INACTIVE')
      return 'Este PokéDrop venció o fue cancelado. Consulta para recuperar un canje anterior.';
    if (error.code === 'RATE_LIMITED')
      return `Espera ${error.retryAfter ?? 60} segundos antes de volver a consultar.`;
    if (error.code === 'DROP_CONFLICT')
      return 'Esta solicitud ya existe con otra configuración. Consulta tus PokéDrops.';
    if (error.code === 'FORBIDDEN')
      return 'Tu cuenta no tiene permiso para esta operación.';
    if (error.code === 'DROP_CONFIGURATION')
      return 'No se pudo preparar el código. Vuelve a intentarlo más tarde.';
  }
  return 'No pudimos confirmar la operación. Consulta su estado o reintenta la misma solicitud; no se duplicarán los premios.';
}
export function useDropClock() {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
export function dateLabel(seconds: number) {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(new Date(seconds * 1000));
}
