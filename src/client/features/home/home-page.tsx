import { Link } from 'react-router';
import { ArrowRight, Layers, QrCode, ArrowLeftRight } from 'lucide-react';
import catalog from '../../../shared/catalog/species.json';
import { Button } from '../../components/ui/button';
import { RulesDialog } from '../../components/rules-dialog';
import { PokemonCard } from '../pokedex/pokemon-card';

const steps = [
  {
    icon: Layers,
    title: 'Hazla tuya',
    description: 'Tu primer Pokémon es el comienzo de una colección única.',
  },
  {
    icon: QrCode,
    title: 'Descubre en clase',
    description:
      'Los PokéDrops del docente te traen tres nuevas oportunidades.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Comparte repetidos',
    description: 'Conecta con tus compañeros y acerca tu Pokédex a la meta.',
  },
];
export function HomePage() {
  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      <section className="grid items-center gap-6 border-b border-zinc-950/10 pb-10 md:grid-cols-[3fr_2fr]">
        <div className="flex flex-col items-start gap-6">
          <p className="font-mono text-base tracking-wide text-rose-700 uppercase sm:text-sm">
            Una nueva aventura en el aula
          </p>
          <h1
            tabIndex={-1}
            className="max-w-[16ch] text-5xl font-semibold tracking-tight text-balance outline-none xl:text-6xl"
          >
            Grandes aventuras.
            <br /> <span className="text-rose-700">Una misma clase.</span>
          </h1>
          <p className="max-w-[48ch] text-lg text-pretty text-zinc-600">
            Descubre Pokémon, comparte tus repetidos y completa tu Pokédex con
            tus compañeros.
          </p>
          <div className="flex flex-wrap items-center gap-5 py-1">
            <Button asChild>
              <Link to="/pokedex">
                Explorar Pokédex
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <RulesDialog />
          </div>
          <p className="max-w-[56ch] text-base text-zinc-500 sm:text-sm">
            Ya puedes explorar el catálogo. El acceso a tu cuenta y el juego
            estarán disponibles próximamente.
          </p>
        </div>
        <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[2rem] bg-rose-50">
          <p className="absolute top-6 left-6 font-mono text-sm tracking-wide text-rose-800 uppercase">
            Descubre lo extraordinario
          </p>
          <div
            aria-hidden="true"
            className="absolute size-4/5 rounded-full border border-rose-700/10"
          />
          <img
            src="/pokemon/25.png"
            width={475}
            height={475}
            alt="Pikachu"
            fetchPriority="high"
            className="relative size-4/5 object-contain"
          />
          <p className="absolute right-6 bottom-6 font-mono text-base tabular-nums text-rose-800">
            #025 / Pikachu
          </p>
        </div>
      </section>
      <section
        aria-labelledby="discover-heading"
        className="flex flex-col gap-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2
            id="discover-heading"
            className="text-2xl font-semibold tracking-tight text-balance"
          >
            Cada colección empieza con uno
          </h2>
          <Link
            to="/pokedex"
            className="rounded-lg py-3 font-medium text-rose-700 underline underline-offset-4"
          >
            Ver las 151 especies
          </Link>
        </div>
        <p className="max-w-[56ch] text-base text-pretty text-zinc-600">
          Tu inicial es aleatorio entre las 151 especies. Estos son algunos de
          los Pokémon que podrías descubrir.
        </p>
        <ul
          role="list"
          className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4"
        >
          {[1, 4, 7, 133].map((id) => (
            <li key={id}>
              <PokemonCard species={catalog[id - 1]} />
            </li>
          ))}
        </ul>
      </section>
      <dl className="grid gap-8 border-t border-zinc-950/10 pt-8 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, description }) => (
          <div key={title} className="flex flex-col gap-3">
            <Icon
              aria-hidden="true"
              className="size-6 shrink-0 stroke-rose-700"
            />
            <dt className="text-lg font-medium">{title}</dt>
            <dd className="max-w-[36ch] text-base text-pretty text-zinc-600">
              {description}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
