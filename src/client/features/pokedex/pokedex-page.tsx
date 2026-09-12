import { useState } from 'react';
import { Search } from 'lucide-react';
import catalog from '../../../shared/catalog/species.json';
import { PageHeading } from '../../components/page-heading';
import { PageState } from '../../components/page-state';
import { RulesDialog } from '../../components/rules-dialog';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { PokemonCard } from './pokemon-card';
import { speciesName } from './species-name';
import { cn } from '../../lib/utils';

const filters = [
  { value: 'all', label: 'Todas', count: 151 },
  { value: 'goal', label: 'Meta', count: 150 },
  { value: 'extra', label: 'Adicional', count: 1 },
] as const;
export function PokedexPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const normalized = query.trim().toLocaleLowerCase('es');
  const matching = catalog.filter(
    (s) =>
      (filter === 'all' || (filter === 'extra' ? s.id === 151 : s.id <= 150)) &&
      (speciesName(s.name).toLocaleLowerCase('es').includes(normalized) ||
        s.name.includes(normalized) ||
        String(s.id).padStart(3, '0').includes(normalized.replace(/^#/, ''))),
  );
  function clear() {
    setQuery('');
    setFilter('all');
  }
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeading
        eyebrow="Catálogo público · Kanto"
        title="Pokédex"
        description="Explora las 151 especies de tu aventura en el aula."
      />
      <section
        aria-label="Buscar en la Pokédex"
        className="flex flex-col gap-4 border-y border-zinc-950/10 py-4 sm:py-6"
      >
        <div className="relative max-w-xl">
          <label htmlFor="pokemon-search" className="sr-only">
            Buscar por nombre o número
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-3 left-3 size-6 stroke-zinc-500"
          />
          <Input
            id="pokemon-search"
            name="pokemon-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o número"
            className="pl-12"
            autoComplete="off"
          />
        </div>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="sr-only">Filtrar especies</legend>
          {filters.map(({ value, label, count }) => (
            <label key={value} className="relative cursor-pointer">
              <input
                type="radio"
                name="species-group"
                value={value}
                checked={filter === value}
                onChange={() => setFilter(value)}
                className="peer sr-only"
              />
              <div
                className={cn(
                  'flex min-h-12 items-center gap-2 rounded-xl border border-zinc-950/10 px-3 text-base text-zinc-600 peer-checked:border-rose-700/40 peer-checked:bg-rose-50 peer-checked:text-rose-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-rose-700 sm:text-sm',
                )}
              >
                <span>{label}</span>
                <span className="font-mono tabular-nums">{count}</span>
              </div>
            </label>
          ))}
        </fieldset>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          role="status"
          aria-live="polite"
          className="text-base tabular-nums text-zinc-600 sm:text-sm"
        >
          {matching.length} {matching.length === 1 ? 'especie' : 'especies'} en
          el catálogo
        </p>
        <RulesDialog />
      </div>
      {matching.length ? (
        <ul
          role="list"
          aria-label="Especies"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4 2xl:grid-cols-5"
        >
          {matching.map((species) => (
            <li key={species.id}>
              <PokemonCard species={species} />
            </li>
          ))}
        </ul>
      ) : (
        <PageState
          kind="empty"
          title="No encontramos esa especie"
          description="Prueba con otro nombre o un número del 001 al 151. También puedes quitar los filtros."
          action={
            <Button variant="outline" onClick={clear}>
              Limpiar búsqueda y filtros
            </Button>
          }
        />
      )}
    </div>
  );
}
