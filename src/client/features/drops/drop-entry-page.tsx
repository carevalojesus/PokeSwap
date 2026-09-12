import { useLayoutEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useSession } from '../auth/session-context';
import { AuthPage } from '../auth/auth-page';
import { SessionLoading, SessionProblem } from '../auth/session-boundary';
import { StudentDropsPage } from './student-drops-page';
import { parseDropInput } from './drop-link';
import { Button } from '../../components/ui/button';

/** The fragment never reaches HTTP. Remove it from this history entry immediately. */
export function DropEntryPage() {
  const location = useLocation();
  const [entry, setEntry] = useState(() => ({
    hash: location.hash,
    code: parseDropInput(window.location.href),
  }));
  if (location.hash && location.hash !== entry.hash)
    setEntry({
      hash: location.hash,
      code: parseDropInput(window.location.href),
    });
  const code = entry.code;
  const session = useSession();
  useLayoutEffect(() => {
    if (window.location.hash)
      window.history.replaceState(window.history.state, '', '/pokedrop');
  }, [location.hash]);
  if (!code)
    return (
      <div className="flex flex-col items-start gap-4">
        <h1 className="text-3xl font-semibold">
          Vuelve a abrir el enlace del PokéDrop
        </h1>
        <p>También puedes pegar el código o escanear el QR desde PokéDrops.</p>
        <Button asChild>
          <Link to="/pokedrops">Ir a PokéDrops</Link>
        </Button>
      </div>
    );
  if (session.profile?.user.role === 'teacher')
    return (
      <div className="flex flex-col items-start gap-4">
        <h1 className="text-3xl font-semibold">
          Este PokéDrop es para alumnos
        </h1>
        <Button asChild>
          <Link to="/docente/pokedrops">Ver mis entregas</Link>
        </Button>
      </div>
    );
  if (session.profile)
    return (
      <StudentDropsPage
        key={`${session.profile.user.id}:${code}`}
        initialCode={code}
      />
    );
  const checking = session.loading && session.action !== 'auth';
  const failed = session.failed && session.action !== 'auth';
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base text-zinc-600">
        Ingresa o crea tu cuenta para consultar el PokéDrop. Abrir este enlace
        no canjea premios. Si recargas, vuelve a abrir el enlace original.
      </p>
      {checking && <SessionLoading />}
      {failed && <SessionProblem />}
      <div hidden={checking || failed}>
        <AuthPage
          key={location.search}
          kind={location.search === '?registro' ? 'register' : 'login'}
          dropEntry
        />
      </div>
    </div>
  );
}
