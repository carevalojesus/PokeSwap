# Interfaz y navegación

La tarea #6 incorpora la base visual de PokéSwap: React Router en modo declarativo, Tailwind CSS, Lucide y componentes locales adaptados de shadcn/ui. El catálogo público usa las 151 especies e imágenes verificadas de #3. No muestra propiedad, progreso ni cantidades de una cuenta.

## Rutas y alcance

| Ruta                           | Estado actual (#8)                                                 |
| ------------------------------ | ------------------------------------------------------------------ |
| `/`                            | Inicio con catálogo, reglas y acceso a la cuenta.                  |
| `/pokedex`                     | Catálogo público, búsqueda, filtros y fichas.                      |
| `/registro`, `/ingresar`       | Formularios conectados a API y confirmación de sesión.             |
| `/perfil`                      | Datos propios y edición con versión; foto privada con recorte.     |
| `/pokedrops`                   | Consulta y canje de tres ejemplares por código, con recuperación.  |
| `/docente/pokedrops`           | Creación, detalle y cancelación de entregas propias.               |
| `/coleccion`                   | Colección agrupada, duplicados, reservas, progreso e inicial real. |
| `/intercambios`, `/ranking`    | Sesión requerida y mensaje de disponibilidad.                      |
| `/docente`, `/docente/alumnos` | Sesión y rol docente requeridos; gestión completa pendiente.       |
| Cualquier otra ruta            | Página no encontrada con retorno al inicio.                        |

La tarea #7 conecta sesión, formularios y datos privados; ver [acceso implementado](ACCESO.md). Visitar `/docente` no concede rol. La API conserva su propia autorización en cada solicitud. Colección/progreso implementados en #10; intercambios en #13–#15 y panel completo en #16.

El catálogo distingue la meta #001–#150 y Mew #151 adicional. El diálogo de reglas muestra `Pikachu ×5`, un protegido y cuatro disponibles como **ejemplo explícito sin reservas**, nunca como estado de una cuenta. No se inventan tipos, estadísticas de combate o cantidades ausentes del catálogo.

## Componentes y presentación

- `app/layout.tsx`: estructura común, navegación lateral desde 1024 px, menú modal e inferior en móvil y tablet; espacio inferior para la barra y safe area.
- `app/navigation.ts`: destinos y etiquetas compartidos, con `aria-current` proporcionado por NavLink.
- `components/ui`: Button, Input y Dialog adaptados de shadcn/ui New York. Radix mantiene la semántica, el bloqueo de foco y su devolución al disparador; se personalizan colores, radios, tamaños y etiquetas en español.
- `components/page-heading.tsx`, `page-state.tsx`, `rules-dialog.tsx`: títulos, estados sin resultados/no disponible/error y reglas comunes.
- `features/pokedex`: tarjetas, imágenes con alternativa textual si fallan, nombres de presentación y búsqueda local. El estado de búsqueda/filtro es local y se reinicia al salir de la página; no se guarda información privada.

La identidad usa blanco, zinc y rosa, Inter local, ilustraciones existentes y números tabulares. Texto general de 16 px en móvil, dos columnas de fichas desde 320 px, controles táctiles y foco visible. Los iconos acompañan etiquetas; los errores incluyen texto y no dependen del color. No se añaden animaciones ni audio en esta entrega.

Al cambiar de ruta se actualiza el título del documento, se dirige el foco al encabezado y se vuelve al inicio del contenido. El enlace «Saltar al contenido» permite evitar la navegación. Los diálogos se cierran con Escape y contienen el foco; los filtros usan radios nativos con manejo de teclado.

## Procedencia

Código de componentes adaptado del [registro shadcn/ui](https://ui.shadcn.com/docs/registry) con [licencia MIT conservada](SHADCN-LICENSE.txt). Se mantiene `components.json` y alias `@/` hacia `src/client` para incorporar componentes cuando su función lo requiera. No se ejecuta un generador que sobrescriba las personalizaciones.

Referencias de implementación: [rutas declarativas de React Router](https://reactrouter.com/start/declarative/routing), [shadcn con Vite](https://ui.shadcn.com/docs/installation/vite) y [diálogos de shadcn/Radix](https://ui.shadcn.com/docs/components/radix/dialog). Versiones exactas en `package.json` y lockfile.

## Verificación

```sh
npm run check
npx playwright install chromium webkit
npm run test:ui
```

`check` valida formato, lint, tipos, catálogo, migraciones, las pruebas de Workers y compilación. `test:ui` usa la compilación existente y arranca un preview nuevo en 4173; ese puerto debe estar libre. No reutiliza un preview anterior porque su manifiesto de assets puede quedar desactualizado después de otro build. Debe ejecutarse después de build/check. El comando de preview elimina `NODE_OPTIONS` solo en su proceso para evitar la modificación de HTML que produce Console Lens.

Los recorridos de Playwright cubren búsqueda, filtros, detalle, Escape/restauración de foco, navegación/historial, rutas directas y recarga, menú móvil, salto al contenido, cantidades del ejemplo, imagen fallida y ausencia de desbordamiento a 320/390/768/1440 px. Se ejecutan con Chromium de escritorio, Chromium móvil y WebKit móvil. En WebKit sobre macOS se usa Option-Tab para recorrer enlaces, según los [atajos de Safari](https://support.apple.com/en-ae/guide/safari/cpsh003/mac), sin cambiar preferencias del equipo. Son emulaciones de navegador; no equivalen a una prueba en teléfonos físicos ni a una auditoría completa de accesibilidad.

Para verificar un despliegue existente:

```sh
POKESWAP_UI_URL=https://pokeswap-classroom.christian-ar-valo-jes-s.workers.dev npm run test:ui
npm run smoke -- https://pokeswap-classroom.christian-ar-valo-jes-s.workers.dev
```

La CI instala los navegadores y ejecuta los recorridos después de `check`. Las trazas de fallos y capturas locales están en `test-results/`, excluidas de Git.

La edición propia y recuperación de conflictos de #8 están descritas en [perfil editable](PERFIL.md).

La #12 añade la entrada pública `/pokedrop#<código>` con autenticación previa a la consulta, QR/enlace en el detalle docente y escáner bajo demanda en PokéDrops. Leer el QR solo rellena el formulario; el canje conserva su botón de confirmación.
