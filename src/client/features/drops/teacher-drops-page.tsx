import { lazy, Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  dropDetailSchema,
  dropListSchema,
  dropSchema,
  type Drop,
} from '../../../shared/schemas/drops';
import { useSession } from '../auth/session-context';
import { ApiError } from '../../lib/api/auth';
import { PageHeading } from '../../components/page-heading';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { PageState } from '../../components/page-state';
import { dateLabel, dropRequest, useDropAction, useDropClock } from './api';

const DropShare = lazy(() => import('./drop-share'));

const stateLabel = {
  active: 'Activo',
  expired: 'Vencido',
  cancelled: 'Cancelado',
};
export function TeacherDropsPage() {
  const { profile } = useSession();
  const userId = profile!.user.id;
  const client = useQueryClient();
  const now = useDropClock();
  const action = useDropAction();
  const form = useForm<{ minutes: number }>({ defaultValues: { minutes: 30 } });
  const [attempt, setAttempt] = useState<{
    id: string;
    minutes: number;
  } | null>(null);
  const [selected, setSelected] = useState<z.infer<
    typeof dropDetailSchema
  > | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState('');
  const list = useQuery({
    queryKey: ['private', 'drops', userId],
    queryFn: async ({ signal }) => {
      const data = await dropRequest(
        '/api/admin/drops',
        dropListSchema,
        signal,
      );
      if (data.userId !== userId) throw new ApiError('SESSION_CHANGED');
      return data;
    },
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });
  useEffect(() => {
    if (
      list.error instanceof ApiError &&
      ['UNAUTHENTICATED', 'SESSION_CHANGED', 'FORBIDDEN'].includes(
        list.error.code,
      )
    )
      client.setQueryData(['private', 'session'], null);
  }, [list.error, client]);
  function accept(data: z.infer<typeof dropDetailSchema>) {
    if (data.userId !== userId) throw new ApiError('SESSION_CHANGED');
    setSelected(data);
    setConfirm(false);
    setCopied('');
    void list.refetch();
  }
  function create(data: { minutes: number }) {
    const input = attempt ?? { id: crypto.randomUUID(), minutes: data.minutes };
    setAttempt(input);
    void action.run(
      (signal) =>
        dropRequest('/api/admin/drops', dropDetailSchema, signal, input),
      (result) => {
        accept(result);
        setAttempt(null);
      },
    );
  }
  function open(id: string) {
    void action.run(
      (signal) =>
        dropRequest(`/api/admin/drops/${id}`, dropDetailSchema, signal),
      accept,
    );
  }
  function state(drop: Drop) {
    return drop.state === 'active' && drop.expiresAt <= now
      ? 'expired'
      : drop.state;
  }
  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow="Tu clase"
        title="PokéDrops"
        description="Entrega tres Pokémon aleatorios a cada alumno. Cada PokéDrop permite un único canje por persona."
      />
      <form
        aria-label="Crear PokéDrop"
        onSubmit={form.handleSubmit(create)}
        className="flex max-w-xl flex-col items-start gap-4"
        noValidate
      >
        <label htmlFor="drop-minutes" className="font-medium">
          Vigencia en minutos
        </label>
        <Input
          id="drop-minutes"
          type="number"
          min={1}
          max={1440}
          aria-invalid={!!form.formState.errors.minutes}
          aria-describedby="drop-duration-help"
          disabled={action.busy || !!attempt}
          {...form.register('minutes', {
            valueAsNumber: true,
            required: true,
            min: 1,
            max: 1440,
            validate: Number.isInteger,
          })}
        />
        <p id="drop-duration-help" className="text-base text-zinc-600">
          30 minutos por defecto. Puedes elegir entre 1 y 1440 minutos.
        </p>
        {form.formState.errors.minutes && (
          <p role="alert" className="text-base text-rose-800">
            Indica un número entero entre 1 y 1440.
          </p>
        )}
        <Button type="submit" disabled={action.busy}>
          {attempt ? 'Reintentar creación' : 'Crear PokéDrop'}
        </Button>
        {attempt && (
          <p className="text-base text-zinc-600">
            La solicitud conserva su identificador para evitar crear dos
            entregas. Reintenta para confirmar el resultado.
          </p>
        )}
      </form>
      {action.error && (
        <p role="alert" className="text-base text-rose-800">
          {action.error}
        </p>
      )}
      {selected && (
        <section
          aria-label="PokéDrop seleccionado"
          className="flex flex-col gap-4 border-y border-zinc-950/10 py-6"
        >
          <h2 className="text-2xl font-semibold tracking-tight text-balance">
            {stateLabel[state(selected.drop)]} · 3 ejemplares por alumno
          </h2>
          <p className="text-base tabular-nums text-zinc-600">
            Vence el {dateLabel(selected.drop.expiresAt)} (Lima). Canjes
            confirmados: {selected.drop.redemptions}.
          </p>
          {state(selected.drop) === 'active' && (
            <>
              {selected.code && (
                <Suspense fallback={<p role="status">Preparando QR…</p>}>
                  <DropShare key={selected.code} code={selected.code} />
                </Suspense>
              )}
              <label htmlFor="drop-code" className="font-medium">
                Código para compartir con tu clase
              </label>
              <Input
                id="drop-code"
                name="drop-code"
                readOnly
                value={selected.code ?? ''}
                className="font-mono"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                className="self-start"
                disabled={!selected.code}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(selected.code!);
                    setCopied('Código copiado.');
                  } catch {
                    setCopied('Selecciona y copia el código del campo.');
                  }
                }}
              >
                Copiar código
              </Button>
              <p role="status" className="text-base text-zinc-600">
                {copied ||
                  'El alumno lo pega en PokéDrops, consulta y confirma su canje.'}
              </p>
              {!selected.code && (
                <p role="alert">
                  El código no está disponible. Cancela esta entrega y crea una
                  nueva.
                </p>
              )}
              {confirm ? (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-base text-zinc-600">
                    Cancelar impedirá nuevos canjes. Los premios ya entregados
                    se conservan.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      disabled={action.busy}
                      onClick={() => setConfirm(false)}
                    >
                      Conservar PokéDrop
                    </Button>
                    <Button
                      variant="outline"
                      disabled={action.busy}
                      onClick={() => {
                        void action.run(
                          (signal) =>
                            dropRequest(
                              `/api/admin/drops/${selected.drop.id}/cancel`,
                              z.strictObject({
                                userId: z.string(),
                                drop: dropSchema,
                              }),
                              signal,
                              {},
                            ),
                          (result) =>
                            accept({ ...result, code: selected.code }),
                        );
                      }}
                    >
                      Confirmar cancelación
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="self-start"
                  disabled={action.busy}
                  onClick={() => setConfirm(true)}
                >
                  Cancelar PokéDrop
                </Button>
              )}
            </>
          )}
          <Button
            variant="ghost"
            className="self-start"
            disabled={action.busy}
            onClick={() => open(selected.drop.id)}
          >
            Consultar estado
          </Button>
        </section>
      )}
      <section aria-label="Tus PokéDrops" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-balance">
            Últimas entregas
          </h2>
          <Button
            variant="outline"
            disabled={list.isFetching}
            onClick={() => {
              void list.refetch();
            }}
          >
            Actualizar entregas
          </Button>
        </div>
        <p className="text-base text-zinc-600">
          Se muestran tus últimos 50 PokéDrops. Selecciona una entrega para
          recuperar su código y consultar los canjes.
        </p>
        {list.isError ? (
          <PageState
            kind="error"
            title="No pudimos consultar las entregas"
            description="Revisa tu conexión y vuelve a actualizar."
          />
        ) : !list.data ? (
          <p role="status">Cargando entregas…</p>
        ) : !list.data.drops.length ? (
          <PageState
            kind="empty"
            title="Todavía no has creado PokéDrops"
            description="Crea la primera entrega para compartir tres nuevos ejemplares con tus alumnos."
          />
        ) : (
          <ul role="list" className="divide-y divide-zinc-950/10">
            {list.data.drops.map((drop) => (
              <li
                key={drop.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <div className="flex flex-col gap-1">
                  <p className="font-medium">
                    {stateLabel[state(drop)]} · {dateLabel(drop.createdAt)}
                  </p>
                  <p className="text-base tabular-nums text-zinc-600">
                    {drop.redemptions} canjes · Vence{' '}
                    {dateLabel(drop.expiresAt)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={action.busy}
                  onClick={() => open(drop.id)}
                >
                  Ver entrega
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
