# Catálogo y sorteos — versión 1

La tarea #3 incluye las especies #001–#151, sus imágenes públicas y la función común de sorteo del servidor. Los servicios de registro y PokéDrops incorporarán esta función y persistirán sus resultados en sus propias tareas; todavía no existen endpoints públicos para obtener premios.

## Catálogo sin dependencia de red

`src/shared/catalog/species.json` contiene ID, nombre canónico de PokéAPI e imagen local. Los identificadores como `nidoran-f`, `nidoran-m`, `farfetchd` y `mr-mime` se conservan como nombres canónicos; la interfaz podrá presentar sus nombres formateados sin alterar los IDs.

`migrations/0002_kanto_catalog.sql` carga las 151 filas en D1. Es una migración de datos: no modifica las migraciones anteriores ni los snapshots del esquema. Wrangler registra su aplicación; repetir el migrador no duplica filas. Un conflicto inesperado con datos existentes falla para que se revise, en lugar de ocultarlo con `INSERT OR IGNORE`.

Las 151 ilustraciones PNG de 475 × 475 se sirven desde `/pokemon/1.png` hasta `/pokemon/151.png`, en el mismo origen de la aplicación. No hay hotlinking ni descargas en cada sorteo. Los metadatos se consultan en D1 o en el snapshot incluido, y las imágenes son solo presentación.

Fuentes fijadas:

- [Datos de PokéAPI](https://github.com/PokeAPI/pokeapi/tree/8fe210b21c9abbe73de93670f3d5a346c80a3625/data/v2/csv), archivo `pokemon_species.csv`.
- [Ilustraciones de PokeAPI/sprites](https://github.com/PokeAPI/sprites/tree/2ecb4eeacd5a1718621fc30f12772e3f60d830b9/sprites/pokemon/other/official-artwork).
- Las imágenes se descargan mediante jsDelivr, fijando esa misma revisión del repositorio.
- `src/shared/catalog/sources.json`: revisiones, URLs, SHA-256 del CSV y tamaño/huella de cada imagen.

PokéAPI es la fuente de distribución; las ilustraciones y los personajes Pokémon pertenecen a sus respectivos titulares. No son recursos originales de PokeSwap ni se presentan como imágenes con licencia propia. Se conservan los créditos en `public/pokemon/README.md`.

## Sorteo del servidor

`src/server/game/draw.ts` exporta `drawPokemon()` y `PROBABILITIES_VERSION = 1`. Cada llamada devuelve `{ speciesId, probabilitiesVersion }`.

1. Obtiene un entero uniforme en `[0, 1000)` usando Web Crypto.
2. `0` entrega Mewtwo #150; `1` entrega Mew #151.
3. Los otros 998 valores realizan una segunda selección uniforme en `[0, 149)` y suman uno.

Por tanto, Mewtwo y Mew reciben cada uno `1/1000 = 0,1 %`; cada especie común recibe `998/(1000 × 149)`. La función no recibe colección, edad ni historial: no cambia las probabilidades, no garantiza raros y permite resultados repetidos en llamadas consecutivas.

`uniformInteger()` usa enteros de 32 bits de `crypto.getRandomValues()`. Para un límite `n`, acepta solo valores menores que `floor(2^32/n) × n`; descarta el sobrante antes de aplicar módulo. Así, todos los residuos tienen el mismo número de valores posibles. Si Web Crypto falla, la operación falla; no se recurre a `Math.random()`. La fuente inyectable sirve para pruebas internas y nunca debe exponerse como parámetro de una solicitud. [Web Crypto en Workers](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/).

Registro usará una llamada y cada PokéDrop tres llamadas independientes. El servicio debe guardar versión y resultados con el premio dentro del mismo lote atómico que crea los ejemplares e historial. Un reintento de una operación ya confirmada devuelve el resultado persistido; no vuelve a sortear. Una futura versión del balance debe conservar la interpretación de premios anteriores.

## Comandos y validación

- `npm run catalog:import`: descarga las revisiones fijadas, valida IDs e imágenes y reconstruye el snapshot y la migración inicial únicamente si coincide o sigue vacía. Reutiliza imágenes cuya huella coincide con el manifiesto. Requiere red solo para esta importación de mantenimiento.
- `npm run catalog:check`: comprueba los 151 IDs consecutivos, nombres únicos y todas las imágenes locales con dimensiones, tamaño y SHA-256. No necesita red; forma parte de `npm run check` y CI.
- `npm run db:migrate:local`, `npm run db:migrate:test` y `npm run db:migrate:remote`: aplican el catálogo mediante el mismo flujo de migraciones que el esquema.

Las pruebas enumeran los 1000 tickets, los 149 resultados comunes, los límites de descarte, fuentes inválidas y resultados repetidos, incluidas ambas especies raras. También comprueban Web Crypto, fallo de entropía, catálogo D1 idéntico al snapshot y funcionamiento con `fetch` fallando. No se usa una muestra aleatoria para exigir la aparición de un Pokémon raro.

Para cambiar datos o imágenes en el futuro, crear una nueva migración y revisar las fuentes y huellas. No editar una migración publicada ni ejecutar importaciones automáticamente durante el arranque, CI o despliegue. Descargar las imágenes una sola vez y conservarlas respeta la recomendación de [caché local de PokéAPI](https://pokeapi.co/docs/v2#fairuse).
