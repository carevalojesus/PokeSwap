import { speciesName } from './species-name';
import type { CollectionSpecies } from '../../../shared/schemas/collection';
import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';

export type Species = { id: number; name: string; imagePath: string };
export function PokemonImage({
  species,
  priority = false,
}: {
  species: Species;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="flex aspect-square flex-col items-center justify-center gap-3 text-center text-base text-zinc-600">
      <ImageOff aria-hidden="true" className="size-6 shrink-0" />
      <p>Imagen no disponible</p>
    </div>
  ) : (
    <img
      src={species.imagePath}
      alt=""
      width={475}
      height={475}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className="aspect-square w-full object-contain"
    />
  );
}
export function PokemonCard({
  species,
  holding,
}: {
  species: Species;
  holding?: CollectionSpecies | null;
}) {
  const name = speciesName(species.name);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Ver ficha de ${name}, número ${species.id}`}
          className="group flex w-full flex-col gap-3 rounded-2xl border border-zinc-950/10 bg-white p-4 text-left hover:border-rose-700/50 hover:bg-rose-50/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-700"
        >
          <p className="flex w-full items-center justify-between gap-2 font-mono text-base tabular-nums text-zinc-500 sm:text-sm">
            <span>#{String(species.id).padStart(3, '0')}</span>
            {species.id === 151 && <span className="text-rose-700">Extra</span>}
          </p>
          <div className="w-full rounded-xl bg-zinc-50 p-2">
            <PokemonImage species={species} />
          </div>
          <p className="font-medium text-zinc-900">{name}</p>
          {holding !== undefined && (
            <p className="text-base tabular-nums text-zinc-600 sm:text-sm">
              {holding
                ? `${holding.total} ${holding.total === 1 ? 'ejemplar' : 'ejemplares'} · ${holding.available} ${holding.available === 1 ? 'disponible' : 'disponibles'}`
                : 'Pendiente'}
            </p>
          )}
          <p className="text-base text-zinc-500 sm:text-sm">
            Ver ficha <span aria-hidden="true">↗</span>
          </p>
        </button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-4">
          <p className="font-mono text-base tabular-nums text-rose-700">
            #{String(species.id).padStart(3, '0')}
          </p>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            {species.id === 151
              ? 'Especie adicional. No modifica la meta de 150 ni la puntuación del ranking.'
              : 'Forma parte de las 150 especies que completan tu Pokédex.'}
          </DialogDescription>
          <div className="max-w-64 self-center">
            <PokemonImage species={species} priority />
          </div>
          {holding !== undefined ? (
            <div className="border-t border-zinc-950/10 pt-4">
              {holding ? (
                <>
                  <dl
                    aria-label="Ejemplares de esta especie"
                    className="grid grid-cols-2 gap-4 text-base tabular-nums"
                  >
                    {Object.entries({
                      Ejemplares: holding.total,
                      Protegidos: holding.protected,
                      Reservados: holding.reserved,
                      Disponibles: holding.available,
                    }).map(([label, value]) => (
                      <div key={label}>
                        <dt className="font-medium">{label}</dt>
                        <dd className="text-zinc-600">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="pt-4 text-base text-pretty text-zinc-600">
                    El primer ejemplar de esta especie está protegido y
                    permanece en tu colección. Los disponibles son los sobrantes
                    sin reserva activa.
                  </p>
                </>
              ) : (
                <p className="text-base text-zinc-600">
                  Todavía no tienes esta especie.
                </p>
              )}
            </div>
          ) : (
            <p className="border-t border-zinc-950/10 pt-4 text-base text-zinc-600">
              Esta ficha pertenece al catálogo público; no indica que tengas
              este Pokémon.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
