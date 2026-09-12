import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useNavigate } from 'react-router';
import { useSession } from './session-context';
import { PageHeading } from '../../components/page-heading';
import { PageState } from '../../components/page-state';
import { Button } from '../../components/ui/button';

export function SessionLoading({ logout = false }: { logout?: boolean }) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite">
      <PageHeading
        eyebrow="Tu cuenta"
        title={logout ? 'Cerrando sesión' : 'Comprobando tu sesión'}
        description={
          logout
            ? 'Estamos confirmando el cierre. Tus datos ya no se muestran en este dispositivo.'
            : 'Un momento mientras verificamos tu acceso.'
        }
      />
    </div>
  );
}
export function SessionProblem() {
  const { retry } = useSession();
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Tu cuenta"
        title="No pudimos verificar tu sesión"
        description="Revisa tu conexión. Tus datos se mostrarán cuando podamos confirmar el acceso."
      />
      <Button onClick={retry} className="self-start">
        Volver a comprobar
      </Button>
    </div>
  );
}
export function SessionGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const navigate = useNavigate();
  if (session.action === 'logout') return <SessionLoading logout />;
  if (session.action === 'logout-failed')
    return (
      <div className="flex flex-col gap-6">
        <PageHeading
          eyebrow="Cierre pendiente"
          title="No pudimos confirmar el cierre"
          description="Los datos locales se han borrado, pero la sesión podría seguir activa. Revisa la conexión y vuelve a intentar el cierre."
        />
        <Button
          className="self-start"
          onClick={async () => {
            if (await session.signOut())
              navigate('/ingresar', { replace: true });
          }}
        >
          Reintentar cierre de sesión
        </Button>
      </div>
    );
  return children;
}
export function RequireSession({ role }: { role?: 'teacher' | 'student' }) {
  const session = useSession();
  if (session.loading || session.action !== 'idle') return <SessionLoading />;
  if (session.failed) return <SessionProblem />;
  if (!session.profile) return <Navigate to="/ingresar" replace />;
  if (role && session.profile.user.role !== role)
    return (
      <div className="flex flex-col gap-6">
        <PageHeading
          eyebrow="Acceso restringido"
          title="Esta sección no está disponible para tu cuenta"
          description="El acceso depende del rol de tu cuenta, verificado por el servidor."
        />
        <PageState
          kind="error"
          title="Continúa en tu espacio"
          description="Puedes volver a tu perfil o explorar el catálogo público."
          action={
            <Button asChild>
              <Link to="/perfil">Ir a mi perfil</Link>
            </Button>
          }
        />
      </div>
    );
  return <Outlet />;
}
export function AnonymousOnly() {
  const session = useSession();
  if (session.profile)
    return (
      <Navigate
        to={session.profile.user.role === 'teacher' ? '/docente' : '/coleccion'}
        replace
      />
    );
  const checking = session.action !== 'auth' && session.loading;
  const failed = session.action !== 'auth' && session.failed;
  // Keep the form mounted through cache replacement so errors and input survive.
  return (
    <>
      {checking && <SessionLoading />}
      {failed && <SessionProblem />}
      <div hidden={checking || failed}>
        <Outlet />
      </div>
    </>
  );
}
