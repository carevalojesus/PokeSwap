import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Menu, ArrowUpRight } from 'lucide-react';
import {
  studentNavigation,
  teacherNavigation,
  mobileNavigation,
} from './navigation';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../components/ui/dialog';
import { RulesDialog } from '../components/rules-dialog';
import { cn } from '../lib/utils';

function Navigation({
  teacher,
  mobileMenu = false,
}: {
  teacher: boolean;
  mobileMenu?: boolean;
}) {
  const items = teacher ? teacherNavigation : studentNavigation;
  return (
    <nav aria-label={teacher ? 'Navegación docente' : 'Navegación principal'}>
      <ul role="list" className="flex flex-col gap-2">
        {items.map(({ to, label, icon: Icon }) => {
          const link = (
            <NavLink
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  'flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 font-medium hover:bg-zinc-100',
                  isActive ? 'bg-rose-50 text-rose-800' : 'text-zinc-600',
                )
              }
            >
              <Icon aria-hidden="true" className="size-6 shrink-0" />
              {label}
            </NavLink>
          );
          return (
            <li key={to}>
              {mobileMenu ? <DialogClose asChild>{link}</DialogClose> : link}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppLayout() {
  const { pathname } = useLocation();
  const teacher = pathname === '/docente' || pathname.startsWith('/docente/');
  const previousPath = useRef(pathname);
  useEffect(() => {
    const heading = document.querySelector('h1');
    document.title = `${heading?.textContent ?? 'Página no encontrada'} · PokéSwap Classroom`;
    if (previousPath.current !== pathname) {
      // Let Radix finish closing its menu before placing focus in the new page.
      const timer = window.setTimeout(() => {
        heading?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: 'instant' });
      }, 0);
      previousPath.current = pathname;
      return () => window.clearTimeout(timer);
    }
  }, [pathname]);
  return (
    <div className="isolate min-h-dvh">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-60 focus:rounded-lg focus:bg-white focus:p-4"
      >
        Saltar al contenido
      </a>
      <header className="border-b border-zinc-950/10 bg-white">
        <div className="mx-auto flex h-20 max-w-400 items-center justify-between gap-4 px-5 sm:px-8">
          <Link
            to="/"
            aria-label="PokéSwap Classroom — Inicio"
            className="flex min-w-0 flex-col gap-0.5"
          >
            <p className="text-2xl font-semibold tracking-tight">
              Poké<span className="text-rose-700">Swap</span>
              <span className="text-rose-700">.</span>
            </p>
            <p className="font-mono text-[0.625rem] tracking-widest text-zinc-500 uppercase">
              Classroom / SENATI
            </p>
          </Link>
          <div className="flex items-center gap-4">
            <p className="text-sm text-zinc-500 max-lg:hidden">
              Colecciona. Intercambia. Conecta.
            </p>
            <div className="max-lg:hidden">
              <RulesDialog />
            </div>
            <Dialog key={pathname}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="lg:hidden"
                  aria-label="Abrir menú"
                >
                  <Menu aria-hidden="true" />
                  Menú
                </Button>
              </DialogTrigger>
              <DialogContent>
                <div className="flex flex-col gap-5">
                  <DialogTitle>Explora PokéSwap</DialogTitle>
                  <DialogDescription>
                    {teacher ? 'Espacio docente.' : 'Tu aventura en el aula.'}
                  </DialogDescription>
                  <Navigation teacher={teacher} mobileMenu />
                  <DialogClose asChild>
                    <Link
                      className="rounded-lg py-3 font-medium text-rose-700 underline underline-offset-4"
                      to={teacher ? '/' : '/docente'}
                    >
                      {teacher ? 'Volver a explorar' : 'Espacio docente'}
                    </Link>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-400">
        <aside className="sticky top-0 flex h-[calc(100dvh-5rem)] w-60 shrink-0 flex-col justify-between gap-8 border-r border-zinc-950/10 px-5 py-8 max-lg:hidden xl:w-64">
          <div className="flex flex-col gap-5">
            <p className="px-4 font-mono text-sm tracking-wide text-zinc-500 uppercase">
              {teacher ? 'Espacio docente' : 'Tu aventura'}
            </p>
            <Navigation teacher={teacher} />
          </div>
          <div className="flex flex-col gap-5 border-t border-zinc-950/10 pt-6">
            <Link
              to={teacher ? '/' : '/docente'}
              className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              {teacher ? 'Volver a explorar' : 'Espacio docente'}
              <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
            <p className="px-4 text-sm text-zinc-500">
              Una clase. Muchas aventuras.
            </p>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <main
            id="contenido"
            tabIndex={-1}
            className="min-w-0 flex-1 px-5 py-8 outline-none sm:px-8 sm:py-10 lg:px-10 xl:px-14"
          >
            <Outlet />
          </main>
          <footer className="flex flex-wrap justify-between gap-3 border-t border-zinc-950/10 px-5 pt-5 pb-[calc(7rem+env(safe-area-inset-bottom))] text-base text-zinc-500 sm:px-8 sm:text-sm lg:px-10 lg:pb-5 xl:px-14">
            <p>Hecho para aprender y compartir.</p>
            <p>
              Por{' '}
              <a
                href="https://github.com/carevalojesus/PokeSwap"
                className="rounded-sm underline underline-offset-4 hover:text-zinc-950"
              >
                Christian Arevalo Jesus
              </a>
              .
            </p>
          </footer>
        </div>
      </div>
      <nav
        aria-label="Navegación inferior"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-950/10 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul role="list" className="grid grid-cols-4 gap-1 p-2">
          {(teacher
            ? [
                ...teacherNavigation,
                { to: '/', label: 'Explorar', icon: mobileNavigation[0].icon },
              ]
            : mobileNavigation
          ).map(({ to, label, icon: Icon }) => (
            <li key={to} className="min-w-0">
              <NavLink
                to={to}
                end
                className={({ isActive }) =>
                  cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 font-medium hover:bg-zinc-100',
                    isActive ? 'bg-rose-50 text-rose-800' : 'text-zinc-600',
                  )
                }
              >
                <Icon aria-hidden="true" className="size-6 shrink-0" />
                <p className="text-[0.6875rem] sm:text-sm">{label}</p>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
