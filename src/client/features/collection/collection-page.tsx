import { useState } from 'react';
import { Link } from 'react-router';
import catalog from '../../../shared/catalog/species.json';
import { PageHeading } from '../../components/page-heading';
import { PageState } from '../../components/page-state';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { RulesDialog } from '../../components/rules-dialog';
import { PokemonCard } from '../pokedex/pokemon-card';
import { speciesName } from '../pokedex/species-name';
import { InitialPage } from '../auth/account-page';
import { useCollection } from './use-collection';

const filters = [
  ['owned', 'Obtenidas'],
  ['duplicates', 'Repetidos'],
  ['missing', 'Pendientes'],
  ['all', 'Todas'],
  ['extra', 'Mew adicional'],
] as const;
export function CollectionPage() {
  const query = useCollection();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('owned');
  const data = query.isError ? undefined : query.data;
  const owned = new Map(data?.species.map((s) => [s.speciesId, s]));
  const term = search.trim().toLocaleLowerCase('es');
  const matching = catalog.filter((species) => {
    const holding = owned.get(species.id);
    return (
      (filter === 'all' ||
        (filter === 'extra'
          ? species.id === 151
          : filter === 'owned'
            ? !!holding
            : filter === 'duplicates'
              ? (holding?.total ?? 0) > 1
              : !holding)) &&
      (speciesName(species.name).toLocaleLowerCase('es').includes(term) ||
        String(species.id).padStart(3, '0').includes(term.replace(/^#/, '')))
    );
  });
  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow="Tu aventura · Kanto"
        title="Mi colección"
        description="Cada ejemplar cuenta. Descubre tus especies, revisa tus repetidos y completa tu Pokédex."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        >
          Actualizar colección
        </Button>
        <RulesDialog />
      </div>
      <p role="status" className="text-base text-zinc-600 sm:text-sm">
        {query.isFetching
          ? 'Actualizando colección…'
          : query.isError
            ? 'No pudimos confirmar tu colección.'
            : 'Colección confirmada. Se actualiza al volver a esta pantalla.'}
      </p>
      {query.isError ? (
        <PageState
          kind="error"
          title="No pudimos cargar la colección"
          description="Revisa tu conexión y pulsa Actualizar colección para volver a intentarlo."
        />
      ) : !data ? (
        <PageState
          title="Cargando tus Pokémon"
          description="Estamos consultando los ejemplares guardados en tu cuenta."
        />
      ) : (
        <>
          <section
            aria-label="Progreso de la Pokédex"
            className="flex flex-col gap-4 border-y border-zinc-950/10 py-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-tight text-balance">
                {data.obtained} de 150 especies
              </h2>
              <p className="font-mono tabular-nums text-rose-700">
                {new Intl.NumberFormat('es-PE', {
                  maximumFractionDigits: 1,
                }).format((data.obtained / 150) * 100)}{' '}
                %
              </p>
            </div>
            <progress
              aria-label="Meta principal de 150 especies"
              value={data.obtained}
              max={150}
              className="h-3 w-full overflow-hidden rounded-full accent-rose-700 [&::-moz-progress-bar]:bg-rose-700 [&::-webkit-progress-bar]:bg-zinc-100 [&::-webkit-progress-value]:bg-rose-700"
            />
            <p className="text-base text-pretty text-zinc-600">
              {data.obtained === 150 ? '¡Completaste la meta principal! ' : ''}
              La meta cuenta especies únicas del #001 al #150. Mew es adicional
              y no cambia el porcentaje ni la puntuación.
            </p>
            <div className="@container">
              <dl
                aria-label="Resumen de ejemplares"
                className="grid grid-cols-2 gap-6 @2xl:grid-cols-4"
              >
                {Object.entries({
                  Ejemplares: data.total,
                  Protegidos: data.species.length,
                  Reservados: data.reserved,
                  Disponibles: data.available,
                }).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="truncate font-medium">{label}</dt>
                    <dd className="text-3xl tabular-nums text-zinc-600">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="text-base text-zinc-600">
              Mew adicional:{' '}
              {owned.has(151)
                ? `obtenido · ${owned.get(151)!.total} ${owned.get(151)!.total === 1 ? 'ejemplar' : 'ejemplares'}`
                : 'pendiente'}
              .
            </p>
          </section>
          <section
            aria-label="Buscar en tu colección"
            className="flex flex-col gap-4"
          >
            <label htmlFor="collection-search" className="font-medium">
              Buscar por nombre o número
            </label>
            <Input
              id="collection-search"
              name="collection-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Por ejemplo, Pikachu o #025"
              autoComplete="off"
              className="max-w-xl"
            />
            <fieldset className="flex flex-wrap gap-3">
              <legend className="sr-only">Filtrar colección</legend>
              {filters.map(([value, label]) => (
                <label key={value} className="relative cursor-pointer">
                  <input
                    className="peer sr-only"
                    type="radio"
                    name="collection-filter"
                    value={value}
                    checked={filter === value}
                    onChange={() => setFilter(value)}
                  />
                  <div className="flex min-h-12 items-center rounded-xl border border-zinc-950/10 px-3 text-base text-zinc-600 peer-checked:border-rose-700/40 peer-checked:bg-rose-50 peer-checked:text-rose-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-rose-700 sm:text-sm">
                    {label}
                  </div>
                </label>
              ))}
            </fieldset>
          </section>
          <p
            role="status"
            className="text-base tabular-nums text-zinc-600 sm:text-sm"
          >
            {matching.length} {matching.length === 1 ? 'especie' : 'especies'}{' '}
            en esta vista{query.isFetching ? ' · Comprobando cambios…' : '.'}
          </p>
          {matching.length ? (
            <ul
              role="list"
              aria-label="Tu colección"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4 2xl:grid-cols-5"
            >
              {matching.map((species) => (
                <li key={species.id}>
                  <PokemonCard
                    species={species}
                    holding={owned.get(species.id) ?? null}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <PageState
              kind="empty"
              title={
                filter === 'duplicates' && !search
                  ? 'Aún no tienes repetidos'
                  : 'No hay especies en esta vista'
              }
              description={
                filter === 'duplicates' && !search
                  ? 'Los nuevos ejemplares de especies que ya tienes aparecerán aquí. Tu primer ejemplar siempre queda protegido.'
                  : 'Prueba otra búsqueda o consulta todas las especies.'
              }
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setFilter('all');
                  }}
                >
                  Ver todas las especies
                </Button>
              }
            />
          )}
        </>
      )}
      <Button asChild variant="outline" className="self-start">
        <Link to="/pokedrops">Canjear un PokéDrop</Link>
      </Button>
      <InitialPage />
    </div>
  );
}
