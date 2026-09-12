import { BrowserRouter, Route, Routes } from 'react-router';
import { SessionRoot } from '../features/auth/session-provider';
import {
  RequireSession,
  AnonymousOnly,
} from '../features/auth/session-boundary';
import { AuthPage } from '../features/auth/auth-page';
import { AccountPage } from '../features/auth/account-page';
import { TeacherDropsPage } from '../features/drops/teacher-drops-page';
import { StudentDropsPage } from '../features/drops/student-drops-page';
import { CollectionPage } from '../features/collection/collection-page';
import { AppLayout } from './layout';
import { HomePage } from '../features/home/home-page';
import { PokedexPage } from '../features/pokedex/pokedex-page';
import { NotFoundPage, PendingPage } from '../features/pending/pending-page';

export function App() {
  return (
    <BrowserRouter>
      <SessionRoot>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="pokedex" element={<PokedexPage />} />
            <Route element={<AnonymousOnly />}>
              <Route
                path="ingresar"
                element={<AuthPage key="login" kind="login" />}
              />
              <Route
                path="registro"
                element={<AuthPage key="register" kind="register" />}
              />
            </Route>
            <Route element={<RequireSession />}>
              <Route path="perfil" element={<AccountPage />} />
              <Route
                path="intercambios"
                element={
                  <PendingPage
                    title="Intercambios"
                    description="Un repetido puede ser el Pokémon que le falta a un compañero."
                  />
                }
              />
              <Route
                path="ranking"
                element={
                  <PendingPage
                    title="Ranking de la clase"
                    description="Una meta compartida: completar las 150 especies de la Pokédex."
                  />
                }
              />
            </Route>
            <Route element={<RequireSession role="student" />}>
              <Route path="coleccion" element={<CollectionPage />} />
              <Route path="pokedrops" element={<StudentDropsPage />} />
            </Route>
            <Route element={<RequireSession role="teacher" />}>
              <Route path="docente">
                <Route
                  index
                  element={
                    <PendingPage
                      teacher
                      title="Tu clase, lista para descubrir"
                      description="El punto de encuentro para acompañar la aventura de tus alumnos."
                    />
                  }
                />
                <Route
                  path="alumnos"
                  element={
                    <PendingPage
                      teacher
                      title="Alumnos"
                      description="Un espacio para consultar y acompañar a los entrenadores de tu clase."
                    />
                  }
                />
                <Route path="pokedrops" element={<TeacherDropsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </SessionRoot>
    </BrowserRouter>
  );
}
