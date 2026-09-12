import { Link } from 'react-router';
import catalog from '../../../shared/catalog/species.json';
import { useSession } from './session-context';
import { PageHeading } from '../../components/page-heading';
import { PageState } from '../../components/page-state';
import { Button } from '../../components/ui/button';
import { PokemonImage } from '../pokedex/pokemon-card';
import { speciesName } from '../pokedex/species-name';

export function AccountPage() {
  const { profile } = useSession();
  if (!profile) return null;
  const { user } = profile;
  const date = user.birthDate.split('-').reverse().join('/');
  const fields = [
    ['ID SENATI', user.senatiId],
    ['Nombre de entrenador', user.trainerName],
    ['Nombres', user.firstNames],
    ['Apellidos', user.lastNames],
    ['Fecha de nacimiento', date],
    ['Edad', `${user.age} años`],
    ['Tipo de cuenta', user.role === 'teacher' ? 'Docente' : 'Alumno'],
  ];
  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow="Tu cuenta"
        title="Mi perfil"
        description="Estos son los datos guardados en tu cuenta. La edición y la foto estarán disponibles próximamente."
      />
      <dl className="grid gap-6 border-y border-zinc-950/10 py-6 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-2">
            <dt className="font-medium">{label}</dt>
            <dd className="break-words text-base tabular-nums text-zinc-600">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-base text-zinc-600">
        Tus compañeros ven tu nombre de entrenador; tus datos personales son
        privados.
      </p>
    </div>
  );
}
export function InitialPage() {
  const { profile } = useSession();
  if (!profile?.initial) return null;
  const species = catalog[profile.initial.speciesId - 1];
  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow="Tu cuenta está lista"
        title="Tu primer compañero"
        description={`¡Bienvenido, ${profile.user.trainerName}! Este es el Pokémon inicial guardado en tu cuenta.`}
      />
      <section
        aria-label="Pokémon inicial confirmado"
        className="grid items-center gap-6 rounded-2xl border border-zinc-950/10 p-6 sm:grid-cols-2"
      >
        <div className="w-full max-w-72">
          <PokemonImage species={species} priority />
        </div>
        <div className="flex flex-col items-start gap-4">
          <p className="font-mono tabular-nums text-rose-700">
            #{String(species.id).padStart(3, '0')} · Inicial
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            {speciesName(species.name)}
          </h2>
          <p className="text-base text-pretty text-zinc-600">
            Esta es tu entrega inicial de registro. Volver a ingresar recupera
            el mismo resultado.
          </p>
          <Button asChild>
            <Link to="/perfil">Ver mi perfil</Link>
          </Button>
        </div>
      </section>
      <PageState
        title="La colección completa llegará pronto"
        description="Aquí podrás consultar todos tus ejemplares y repetidos cuando se habiliten la colección y los PokéDrops. Por ahora mostramos la entrega inicial confirmada."
        action={
          <Button asChild variant="outline">
            <Link to="/pokedex">Explorar Pokédex</Link>
          </Button>
        }
      />
    </div>
  );
}
