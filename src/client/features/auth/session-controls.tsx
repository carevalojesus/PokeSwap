import { Link, useNavigate } from 'react-router';
import { useSession } from './session-context';
import { Button } from '../../components/ui/button';
import { DialogClose } from '../../components/ui/dialog';

export function SessionControls({ mobile = false }: { mobile?: boolean }) {
  const session = useSession();
  const navigate = useNavigate();
  const logout = (
    <Button
      variant="outline"
      onClick={async () => {
        if (await session.signOut()) navigate('/ingresar', { replace: true });
      }}
    >
      Cerrar sesión
    </Button>
  );
  if (
    session.action === 'idle' &&
    session.canSignOut &&
    (session.loading || session.failed)
  )
    return mobile ? <DialogClose asChild>{logout}</DialogClose> : logout;
  if (session.loading || session.action !== 'idle')
    return <p className="text-sm text-zinc-600">Comprobando sesión…</p>;
  if (!session.profile) {
    const link = (
      <Button asChild variant="outline">
        <Link to="/ingresar">Ingresar</Link>
      </Button>
    );
    return mobile ? <DialogClose asChild>{link}</DialogClose> : link;
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      <p className="text-base text-zinc-600 sm:text-sm">
        {session.profile.user.role === 'teacher' ? 'Docente' : 'Alumno'}
      </p>
      {!mobile && (
        <Button variant="ghost" asChild>
          <Link to="/perfil">Mi perfil</Link>
        </Button>
      )}
      {mobile ? <DialogClose asChild>{logout}</DialogClose> : logout}
    </div>
  );
}
