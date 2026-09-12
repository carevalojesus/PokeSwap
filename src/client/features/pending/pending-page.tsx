import { Link } from 'react-router';
import { PageHeading } from '../../components/page-heading';
import { PageState } from '../../components/page-state';
import { Button } from '../../components/ui/button';
import { RulesDialog } from '../../components/rules-dialog';

export function PendingPage({
  title,
  description,
  teacher = false,
}: {
  title: string;
  description: string;
  teacher?: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow={teacher ? 'Espacio docente' : 'Tu aventura'}
        title={title}
        description={description}
        action={<RulesDialog />}
      />
      <PageState
        title={
          teacher
            ? 'Estamos preparando tu espacio docente'
            : 'Esta parte de la aventura llegará pronto'
        }
        description={
          teacher
            ? 'La gestión de alumnos y PokéDrops estará disponible con acceso docente. Por ahora puedes explorar la Pokédex y conocer las reglas.'
            : 'El acceso a tu cuenta y esta sección estarán disponibles próximamente. Mientras tanto, descubre las especies y las reglas del juego.'
        }
        action={
          <Button asChild>
            <Link to="/pokedex">Explorar Pokédex</Link>
          </Button>
        }
      />
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        eyebrow="Error 404"
        title="Este camino no existe"
        description="La dirección no corresponde a una página de PokéSwap."
      />
      <PageState
        kind="error"
        title="Vuelve a un lugar conocido"
        description="Comprueba la dirección o regresa al inicio para continuar explorando."
        action={
          <Button asChild>
            <Link to="/">Volver al inicio</Link>
          </Button>
        }
      />
    </div>
  );
}
