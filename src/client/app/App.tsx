import { ArrowLeftRight, Layers, QrCode } from 'lucide-react';

const steps = [
  {
    icon: Layers,
    title: 'Colecciona',
    description: 'Recibe tu primer Pokémon y empieza a descubrir tu Pokédex.',
  },
  {
    icon: QrCode,
    title: 'Descubre',
    description: 'Canjea los QR de tu docente y recibe tres Pokémon más.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Intercambia',
    description: 'Acumula repetidos y cámbialos con tus compañeros.',
  },
];

export function App() {
  return (
    <div className="isolate flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-4 focus:z-10 focus:bg-white focus:p-3"
      >
        Saltar al contenido
      </a>
      <header className="border-b border-zinc-950/10 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 sm:px-10">
          <a
            href="/"
            aria-label="PokéSwap Classroom — Inicio"
            className="font-semibold tracking-tight"
          >
            PokéSwap{' '}
            <span className="font-normal text-zinc-500">Classroom</span>
          </a>
          <p className="text-base text-zinc-600 sm:text-sm">SENATI</p>
        </div>
      </header>
      <main id="contenido" className="flex-1 py-16 sm:py-24">
        <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 sm:gap-16 sm:px-10">
          <div className="flex flex-col items-start gap-6">
            <p className="font-mono text-base tracking-wide text-rose-700 uppercase sm:text-sm">
              Una nueva aventura en el aula
            </p>
            <h1 className="max-w-[20ch] text-5xl font-semibold tracking-tight text-balance sm:text-7xl">
              Colecciona. Intercambia.{' '}
              <span className="text-rose-700">Conecta.</span>
            </h1>
            <p className="max-w-[48ch] text-xl text-pretty text-zinc-600 sm:text-lg">
              Tu próxima colección empieza con tus compañeros. Descubre Pokémon,
              comparte tus repetidos y completa tu Pokédex.
            </p>
            <div className="flex max-w-xl flex-col gap-2 border-l-2 border-rose-700 pl-5">
              <h2 className="text-lg font-medium text-balance">
                Estamos preparando tu aventura
              </h2>
              <p className="text-base text-pretty text-zinc-600 sm:text-sm">
                El registro y el juego estarán disponibles próximamente.
              </p>
            </div>
          </div>
          <dl className="grid gap-8 border-t border-zinc-950/10 pt-10 sm:grid-cols-3">
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
      </main>
      <footer className="border-t border-zinc-950/10 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 text-base text-zinc-600 sm:flex-row sm:justify-between sm:px-10 sm:text-sm">
          <p>Hecho para aprender, descubrir y compartir.</p>
          <p>
            Un proyecto de{' '}
            <a
              className="underline decoration-zinc-400 underline-offset-4 hover:text-zinc-950"
              href="https://github.com/carevalojesus/PokeSwap"
            >
              Christian Arevalo Jesus
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
