import { BookOpen, LockKeyhole, ArrowLeftRight } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';

export function RulesDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <BookOpen aria-hidden="true" />
          Cómo jugar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-5">
          <DialogTitle>Tu aventura, paso a paso</DialogTitle>
          <DialogDescription>
            Colecciona con tu clase y comparte tus repetidos.
          </DialogDescription>
          <ol className="flex list-decimal flex-col gap-4 pl-5 text-base text-zinc-700">
            <li>Al registrarte recibes un Pokémon aleatorio.</li>
            <li>
              Cada PokéDrop del docente entrega tres ejemplares. Puedes
              canjearlo una sola vez.
            </li>
            <li>
              Intercambia repetidos, uno por uno, con la aceptación de ambos
              compañeros.
            </li>
            <li>
              Completa las especies #001–#150. Mew es adicional y no cambia la
              meta ni el ranking.
            </li>
          </ol>
          <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-4">
            <p className="font-medium">Ejemplo de duplicados</p>
            <p className="text-2xl font-semibold tabular-nums">Pikachu ×5</p>
            <p className="text-base text-zinc-600">
              Cinco ejemplares de una sola especie, sin reservas activas.
            </p>
            <p className="flex items-center gap-2 text-base">
              <LockKeyhole aria-hidden="true" className="size-6 shrink-0" />1
              protegido
            </p>
            <p className="flex items-center gap-2 text-base">
              <ArrowLeftRight aria-hidden="true" className="size-6 shrink-0" />4
              disponibles para intercambiar
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
