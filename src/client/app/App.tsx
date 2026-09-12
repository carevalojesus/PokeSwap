import { BrowserRouter, Route, Routes } from 'react-router';
import { AppLayout } from './layout';
import { HomePage } from '../features/home/home-page';
import { PokedexPage } from '../features/pokedex/pokedex-page';
import { NotFoundPage, PendingPage } from '../features/pending/pending-page';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="pokedex" element={<PokedexPage />} />
          <Route
            path="coleccion"
            element={
              <PendingPage
                title="Mi colección"
                description="Tus especies, tus repetidos y todo lo que te falta por descubrir."
              />
            }
          />
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
          <Route
            path="perfil"
            element={
              <PendingPage
                title="Mi perfil"
                description="Tu identidad de entrenador y tus datos personales, en un solo lugar."
              />
            }
          />
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
            <Route
              path="pokedrops"
              element={
                <PendingPage
                  teacher
                  title="PokéDrops"
                  description="Comparte nuevas oportunidades de descubrir Pokémon con tu clase."
                />
              }
            />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
