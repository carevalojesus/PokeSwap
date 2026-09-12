import { lazy, Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Link } from 'react-router';
import {
  dropPreviewSchema,
  rewardSchema,
  type DropReward,
} from '../../../shared/schemas/drops';
import catalog from '../../../shared/catalog/species.json';
import { useSession } from '../auth/session-context';
import { ApiError } from '../../lib/api/auth';
import { refreshCollection } from '../collection/use-collection';
import { PageHeading } from '../../components/page-heading';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { PokemonImage } from '../pokedex/pokemon-card';
import { speciesName } from '../pokedex/species-name';
import { Camera } from 'lucide-react';
import { parseDropInput } from './drop-link';
import { dateLabel, dropRequest, useDropAction, useDropClock } from './api';

const DropScanner = lazy(() => import('./drop-scanner'));
const inputSchema = z.object({
  code: z.string().transform((value, ctx) => {
    const code = parseDropInput(value);
    if (!code) {
      ctx.addIssue({ code: 'custom', message: 'Código o enlace inválido' });
      return z.NEVER;
    }
    return code;
  }),
});

export function StudentDropsPage({
  initialCode = '',
}: {
  initialCode?: string;
}) {
  const { profile, loading, failed, action: sessionAction } = useSession();
  const [camera, setCamera] = useState(false);
  if (camera && (loading || failed || sessionAction !== 'idle'))
    setCamera(false);
  const userId = profile!.user.id;
  const client = useQueryClient();
  const action = useDropAction();
  const now = useDropClock();
  const form = useForm<z.infer<typeof inputSchema>>({
    resolver: zodResolver(inputSchema),
    defaultValues: { code: initialCode },
  });
  const [preview, setPreview] = useState<z.infer<
    typeof dropPreviewSchema
  > | null>(null);
  const [activeCode, setActiveCode] = useState('');
  const [reward, setReward] = useState<DropReward | null>(null);
  function saved(result: DropReward) {
    if (result.userId !== userId) throw new ApiError('SESSION_CHANGED');
    setReward(result);
    void refreshCollection(client);
  }
  function consult(input: { code: string }) {
    setCamera(false);
    setPreview(null);
    setReward(null);
    setActiveCode(input.code);
    void action.run(
      (signal) =>
        dropRequest('/api/drops/preview', dropPreviewSchema, signal, input),
      (result) => {
        if (result.userId !== userId) throw new ApiError('SESSION_CHANGED');
        setPreview(result);
        if (result.reward) saved(result.reward);
      },
    );
  }
  const active =
    preview?.drop.state === 'active' && preview.drop.expiresAt > now;
  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow="Un regalo para tu aventura"
        title="Canjear PokéDrop"
        description="Escanea el QR o pega el enlace o código que comparte tu docente. Consultarlo no entrega premios: tú confirmas el canje."
      />
      {camera && !loading && !failed && sessionAction === 'idle' ? (
        <Suspense fallback={<p role="status">Preparando cámara…</p>}>
          <DropScanner
            onClose={() => setCamera(false)}
            onCode={(code) => {
              setCamera(false);
              setPreview(null);
              setReward(null);
              form.setValue('code', code, { shouldValidate: true });
              form.setFocus('code');
            }}
          />
        </Suspense>
      ) : (
        <Button
          variant="outline"
          className="self-start"
          disabled={action.busy}
          onClick={() => setCamera(true)}
        >
          <Camera aria-hidden="true" className="size-5" />
          Escanear QR
        </Button>
      )}
      <form
        aria-label="Consultar PokéDrop"
        onSubmit={form.handleSubmit(consult)}
        className="flex max-w-xl flex-col items-start gap-4"
        noValidate
      >
        <label htmlFor="student-drop-code" className="font-medium">
          Código del PokéDrop o enlace
        </label>
        <Input
          id="student-drop-code"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!form.formState.errors.code}
          disabled={action.busy}
          {...form.register('code', {
            onChange: () => {
              setPreview(null);
              setReward(null);
            },
          })}
        />
        {form.formState.errors.code && (
          <p role="alert" className="text-base text-rose-800">
            Pega el código completo de 64 caracteres o el enlace de este sitio
            que te entregó el docente.
          </p>
        )}
        <Button type="submit" variant="outline" disabled={action.busy}>
          Consultar PokéDrop
        </Button>
        <p className="text-base text-zinc-600">
          Si perdiste la respuesta o recargaste la página, consulta el mismo
          código para recuperar los tres resultados guardados.
        </p>
      </form>
      {action.error && (
        <p role="alert" className="text-base text-rose-800">
          {action.error}
        </p>
      )}
      {preview && !reward && (
        <section
          aria-label="Confirmar canje"
          className="flex flex-col items-start gap-4 border-y border-zinc-950/10 py-6"
        >
          <h2 className="text-2xl font-semibold tracking-tight text-balance">
            {active
              ? 'Tres nuevos ejemplares te esperan'
              : preview.drop.state === 'cancelled'
                ? 'PokéDrop cancelado'
                : 'PokéDrop vencido'}
          </h2>
          <p className="text-base text-zinc-600">
            Vencimiento: {dateLabel(preview.drop.expiresAt)} (Lima). Un canje
            por alumno. Los sorteos pueden incluir repetidos.
          </p>
          {active && (
            <Button
              disabled={action.busy}
              onClick={() => {
                void action.run(
                  (signal) =>
                    dropRequest(
                      '/api/drops/redeem',
                      z.strictObject({ reward: rewardSchema }),
                      signal,
                      { code: activeCode },
                    ),
                  (result) => saved(result.reward),
                );
              }}
            >
              Confirmar canje de 3 Pokémon
            </Button>
          )}
        </section>
      )}
      {reward && (
        <section
          aria-label="Premios confirmados"
          className="flex flex-col gap-5"
        >
          <h2 className="text-2xl font-semibold tracking-tight text-balance">
            Tus tres Pokémon están guardados
          </h2>
          <p role="status" className="text-base text-zinc-600">
            Canje confirmado. Consultar o reintentar este PokéDrop recupera
            estos mismos ejemplares.
          </p>
          <ul role="list" className="grid gap-5 sm:grid-cols-3">
            {reward.instances.map((instance) => {
              const species = catalog[instance.speciesId - 1];
              return (
                <li
                  key={instance.instanceId}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-950/10 p-5"
                >
                  <p className="font-mono tabular-nums text-rose-700">
                    #{String(species.id).padStart(3, '0')} · Premio{' '}
                    {instance.slot + 1}
                  </p>
                  <div className="max-w-56 self-center">
                    <PokemonImage species={species} />
                  </div>
                  <h3 className="text-xl font-medium text-balance">
                    {speciesName(species.name)}
                  </h3>
                </li>
              );
            })}
          </ul>
          <Button asChild className="self-start">
            <Link to="/coleccion">Ver mi colección</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
