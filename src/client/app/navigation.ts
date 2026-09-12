import {
  ArrowLeftRight,
  BookOpen,
  Gift,
  House,
  Layers,
  Trophy,
  UserRound,
  UsersRound,
} from 'lucide-react';

export const studentNavigation = [
  { to: '/', label: 'Inicio', icon: House },
  { to: '/coleccion', label: 'Colección', icon: Layers },
  { to: '/pokedex', label: 'Pokédex', icon: BookOpen },
  { to: '/intercambios', label: 'Intercambios', icon: ArrowLeftRight },
  { to: '/ranking', label: 'Ranking', icon: Trophy },
  { to: '/perfil', label: 'Mi perfil', icon: UserRound },
];
export const teacherNavigation = [
  { to: '/docente', label: 'Resumen', icon: House },
  { to: '/docente/alumnos', label: 'Alumnos', icon: UsersRound },
  { to: '/docente/pokedrops', label: 'PokéDrops', icon: Gift },
];
export const mobileNavigation = studentNavigation.filter(({ to }) =>
  ['/', '/coleccion', '/pokedex', '/perfil'].includes(to),
);
