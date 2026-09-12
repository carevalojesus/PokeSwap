# PokéSwap Classroom

> Colecciona. Intercambia. Completa tu Pokédex.

PWA educativa para estudiantes de SENATI: recibe Pokémon aleatorios, acumula ejemplares y cambia tus repetidos con compañeros mediante códigos QR. El profesor distribuye nuevos Pokémon con PokéDrops.

**Estado actual:** base de React, Vite y TypeScript implementada con API Hono en Cloudflare Workers. Incluye inicio, navegación móvil y docente, Pokédex pública con búsqueda/fichas, ruta de salud, pruebas y configuración de despliegue; ver [interfaz y alcance](docs/INTERFAZ.md). D1 dispone de esquema, migraciones y pruebas de integridad. El catálogo de 151 especies, sus imágenes locales y la función de sorteo versionada están implementados; el servicio de registro atómico ya utiliza el sorteo. El registro, login/logout, sesión y permisos ya están conectados a formularios y rutas protegidas. El perfil propio permite editar nombres y nacimiento con control de versión; se muestra la entrega inicial confirmada. La colección agrupada, los duplicados y el progreso sobre 150 especies están implementados; ver [colección](docs/COLECCION.md). Los PokéDrops ya permiten creación, consulta, cancelación y canje único de tres ejemplares; ver [PokéDrops](docs/POKEDROPS.md). Las fotos privadas con recorte y R2 están implementadas; ver [fotos y recuperación](docs/FOTOS.md). Las funciones del juego y la PWA siguen pendientes en [GitHub Projects](https://github.com/users/carevalojesus/projects/6/views/2).

**Autor:** [Christian Arevalo Jesus](https://github.com/carevalojesus).

Repositorio: [carevalojesus/PokeSwap](https://github.com/carevalojesus/PokeSwap).

**Organización:** [tablero de GitHub Projects](https://github.com/users/carevalojesus/projects/6/views/2) · [issues](https://github.com/carevalojesus/PokeSwap/issues) · [flujo de trabajo](TRABAJO.md). La implementación se organiza por issues con dependencias, prioridades, fases y criterios de aceptación.

## Interfaz disponible

Explora el [catálogo público](https://pokeswap-classroom.christian-ar-valo-jes-s.workers.dev/pokedex), busca especies por nombre o número y consulta las reglas. Puedes [crear tu cuenta de alumno](https://pokeswap-classroom.christian-ar-valo-jes-s.workers.dev/registro) o [ingresar](https://pokeswap-classroom.christian-ar-valo-jes-s.workers.dev/ingresar) con tu ID y contraseña. Alumnos y docente comparten el formulario de acceso. El perfil propio, el inicial y la colección son reales; ranking y gestión docente siguen en sus issues. Ver [sesión y formularios](docs/ACCESO.md) y [perfil editable](docs/PERFIL.md).

Ver [componentes, rutas y pruebas de navegador](docs/INTERFAZ.md). Tras `npm run build`, ejecuta `npx playwright install chromium webkit` y `npm run test:ui` para comprobar la interfaz.

## Reglas del juego

- La meta es completar las **150 especies del #001 al #150**.
- Cada alumno recibe **un inicial aleatorio entre las 151 especies disponibles**. Mew y Mewtwo también pueden salir, con una probabilidad reducida del 0,1 % cada uno.
- El QR de bienvenida del docente entrega **tres Pokémon adicionales** por alumno en un único canje.
- Los sorteos son independientes, permiten repetidos y usan probabilidades fijas: Mew y Mewtwo son igualmente difíciles de obtener. El docente puede crear más PokéDrops para seguir entregando ejemplares.
- Registro más primer PokéDrop dejan al alumno con **cuatro ejemplares**, que pueden ser de especies iguales o diferentes.
- Los repetidos se acumulan: `Pikachu ×5` representa cinco ejemplares individuales, no cinco especies diferentes.
- Se protege un ejemplar por especie y solo se intercambian los sobrantes. Cinco Pikachu permiten ofrecer cuatro, si no hay reservas activas.
- Los intercambios son uno por uno, requieren propuesta y aceptación, y transfieren ambos ejemplares o ninguno.
- El ranking cuenta especies únicas del #001 al #150; los alumnos con la misma cantidad comparten posición. Mew se muestra como colección adicional y no cambia la puntuación.
- Mew #151 está incluido en el MVP, en el catálogo y en los sorteos normales. Se muestra como una entrada adicional en la Pokédex, obtenida o pendiente; no aumenta el denominador de la meta de 150 ni su porcentaje.

No se fuerzan duplicados: si un alumno recibe cuatro especies diferentes, puede seguir coleccionando mediante PokéDrops hasta obtener ejemplares adicionales de alguna especie. No se garantiza completar los 150 durante una clase.

## Registro e identidad del alumno

Cada alumno completa estos campos al registrarse:

| Campo | Requisito y comportamiento |
|---|---|
| ID de SENATI | Obligatorio y único. Identifica la cuenta y se utiliza para iniciar sesión. |
| Nombres | Obligatorios; se admiten nombres compuestos, espacios y tildes. |
| Apellidos | Obligatorios en un campo independiente; se admiten apellidos compuestos. |
| Contraseña | Obligatoria, de 15 a 128 caracteres; se guarda su hash scrypt con sal, nunca el texto original. |
| Fecha de nacimiento | Obligatoria, como fecha de calendario `YYYY-MM-DD`; permite mostrar la edad. |
| Nombre de entrenador | Lo genera el servidor; el alumno no tiene que inventarlo ni escribirlo. |
| Foto de perfil | Opcional; puede seleccionarse durante el registro o subirse y cambiarse después. |

El ID de SENATI se almacena como **texto**, conservando ceros iniciales. Se recortan espacios exteriores y se normalizan letras a mayúsculas; no se eliminan ceros ni separadores internos. Para el MVP se admite un valor de 1 a 32 caracteres sin espacios internos ni caracteres de control. No se presupone una longitud institucional fija ni se afirma verificar matrícula con SENATI: la validación local comprueba formato básico y unicidad.

Nombres y apellidos se recortan, normalizan espacios y conservan su escritura y tildes; cada campo admite de 1 a 100 caracteres y no acepta solo espacios. Dos alumnos pueden tener el mismo nombre completo, pero no el mismo ID de SENATI.

El servicio de registro de #4 está conectado con HTTP y sesiones en #5. Ver [registro atómico](docs/REGISTRO.md) y [autenticación](docs/AUTENTICACION.md). El registro guarda en una única operación de D1 la cuenta, el nombre de entrenador, el ejemplar inicial y su historial. La restricción única del ID evita cuentas y premios duplicados incluso ante solicitudes simultáneas. Un intento con un ID existente indica que debe iniciarse sesión; no reemplaza contraseña, datos ni colección. Recuperar el resultado de una cuenta existente requiere autenticarse.

Una vez confirmada la cuenta se establece la sesión. Si falla la entrega de la respuesta o la creación de la sesión, el alumno puede iniciar sesión con sus credenciales y recuperar el perfil y el mismo inicial ya guardados.

### Nombre de entrenador generado

Debe sonar a personaje del universo de entrenadores Pokémon y mantenerse estable durante el juego. Ejemplos de formato: **Kairo del Trueno · 7K4P** y **Lumion de la Aurora · 9R2M**. Son ejemplos; no nombres asignados a cuentas reales.

Algoritmo implementado en el servidor, versión 1:

1. Combinar dos o tres sílabas de listas curadas de inicios, enlaces y terminaciones pronunciables; por ejemplo, `Kai + ro` o `Lu + mi + on`.
2. Añadir un epíteto de una lista revisada, como `del Trueno`, `de la Aurora`, `del Alba` o `de la Bruma`.
3. Añadir un sufijo aleatorio de cuatro caracteres legibles, independiente del ID de SENATI y de la fecha de nacimiento.
4. Comprobar el nombre completo contra una clave normalizada con restricción `UNIQUE` en D1. Ante una colisión, regenerar el candidato y reintentar de forma acotada; si se agotan los intentos, no dejar un registro parcial.
5. Persistir el nombre completo y la versión del generador junto a la cuenta.

Las listas de sílabas y epítetos se revisan para evitar combinaciones ofensivas. No se requiere IA ni una API externa para generar nombres. Las consultas, cambios de foto, cumpleaños y nuevos inicios de sesión **no generan otro nombre**. Cambiarlo manualmente queda fuera del MVP.

El estilo del alias evoca a un maestro Pokémon, pero no concede un nivel ni el logro de completar los 150. Ranking e intercambios muestran este alias para identificar al jugador.

### Fecha de nacimiento y edad

Se persiste `birth_date`; **no se almacena una edad fija**. El servidor calcula los años cumplidos al consultar el perfil usando la fecha actual en `America/Lima`:

- Restar el año de nacimiento al año actual.
- Restar uno si todavía no ocurrió el cumpleaños de ese año.
- Para nacimientos del 29 de febrero, en años no bisiestos el incremento se aplica el 1 de marzo, como convención de la aplicación.

La validación rechaza fechas inexistentes y futuras. La fecha se trata como calendario, sin convertirla a medianoche UTC ni dividir milisegundos entre 365 días. El perfil se vuelve a consultar al abrirse o recuperar el foco; si permanece visible, se actualiza al cambiar el día en Lima.

El alumno puede corregir sus nombres, apellidos y fecha de nacimiento desde su perfil; los cambios se guardan en D1. El ID de SENATI y el alias no son editables por el alumno en el MVP. Ni la edad ni la fecha de nacimiento modifican los premios o sus probabilidades.

En **Mi perfil** se muestran los datos personales y la edad calculada. El profesor puede consultar estos datos en el panel de alumnos. Las vistas de compañeros, el ranking y las propuestas muestran solo el alias y la foto: no exponen ID de SENATI, nombres legales, fecha de nacimiento ni edad.

### Foto de perfil persistente

Las fotos se almacenan como objetos en un bucket privado de **Cloudflare R2**. D1 guarda la clave del objeto y sus metadatos, no la imagen en base64. El navegador puede mostrar una previsualización temporal, pero esa previsualización no constituye un guardado.

Flujo y límites del MVP:

1. El alumno selecciona una imagen JPEG, PNG o WebP de hasta 5 MiB. La interfaz ofrece recorte cuadrado y exporta una versión WebP de 512 × 512 píxeles, de hasta 1 MiB.
2. La carga se realiza después de crear la cuenta y autenticar la sesión. El Worker vuelve a validar tamaño, tipo real, estructura y dimensiones del WebP recibido; no confía únicamente en extensión o `Content-Type`. No admite SVG, archivos animados ni cargas de otro usuario.
3. El Worker crea una clave de objeto aleatoria, sin ID de SENATI ni nombre original del archivo, y guarda la imagen en R2.
4. Solo después de guardar el objeto actualiza la referencia del perfil en D1. La interfaz muestra éxito cuando esa referencia queda confirmada.
5. Las fotos se sirven mediante una ruta autenticada del Worker que resuelve la referencia vigente del usuario; no se acepta una clave arbitraria de R2 enviada por el cliente ni se habilita un bucket público.

Si la carga falla, el alumno conserva su cuenta, su inicial y el avatar predeterminado, o su foto anterior si ya tenía una. Puede reintentar sin registrarse de nuevo. Si inició sesión desde otro dispositivo, la imagen se recupera desde la referencia guardada en D1 y el objeto de R2.

La sustitución utiliza una versión de perfil para detectar cargas concurrentes: si otra modificación ya cambió la versión, se devuelve conflicto y se conserva la referencia confirmada. Se elimina la foto anterior solo después de actualizar D1; eliminar la foto del perfil primero quita la referencia en D1 y después elimina el objeto. Un fallo de actualización o borrado deja una tarea de limpieza persistente para reintentar, sin borrar la imagen vigente. Las tareas comprueban referencias y cargas activas antes de borrar objetos.

D1 y R2 no se tratan como una sola transacción. Cada carga tiene un registro persistente con clave, propietario, estado y fecha; permite conciliar archivos sin referencia si el proceso se interrumpe. Una misma clave de idempotencia de carga recupera su operación en lugar de crear varias imágenes. El MVP debe incluir una tarea programada del Worker para resolver cargas abandonadas y borrados pendientes. La ruta de imagen usa caché privada con revalidación para reflejar cambios sin conservar fotos antiguas en el service worker.

## Probabilidades y dificultad de Mew y Mewtwo

**Mewtwo #150 y Mew #151 pueden salir como inicial o en cualquiera de los tres sorteos de un PokéDrop. Ambos tienen la misma dificultad: 0,1 % por especie y por sorteo.** Se fija este balance inicial para implementar el MVP:

| Resultado | Probabilidad por sorteo |
|---|---:|
| Mewtwo #150 | **0,1 %** |
| Mew #151 | **0,1 %** |
| Conjunto de especies #001–#149 | **99,8 %**, distribuido por igual entre esas 149 especies |

La probabilidad individual de cada especie #001–#149 es `99,8 % / 149`, aproximadamente `0,66980 %`. La distribución total suma 100 %: 0,1 % para Mewtwo, 0,1 % para Mew y 99,8 % para las demás especies. La dificultad especial de Mew y Mewtwo es una regla de este juego, no un valor tomado de PokéAPI. Las demás especies no tienen diferencias de rareza en este MVP.

Algoritmo implementado en `src/server/game/draw.ts` (balance versión 1; ver [catálogo y sorteos](docs/CATALOGO.md)): obtener un entero uniforme de 0 a 999 con aleatoriedad segura; si sale 0, entregar Mewtwo; si sale 1, entregar Mew. En los otros 998 casos, sortear uniformemente un ID entre 1 y 149. La selección de enteros evita sesgo por aplicar módulo directamente a bytes aleatorios.

Se utiliza la misma función y configuración para el inicial y cada premio del docente. Cada sorteo es independiente, con reemplazo: poseer Mew o Mewtwo no aumenta ni reduce las probabilidades y ambos pueden salir repetidos. El primer ejemplar de cada especie queda protegido; los adicionales pueden intercambiarse bajo las reglas normales. Obtener Mew no requiere completar previamente los 150 ni participar en un evento especial.

El 0,1 % es una probabilidad por especie y por intento, **no una entrega garantizada cada 1000 sorteos**. No se garantiza que Mew o Mewtwo aparezcan en una clase ni que todos completen la Pokédex. No hay corrección de mala suerte ni premios forzados. El balance es una constante versionada en el backend, sin editor administrativo durante esta jornada; cambiarla en el futuro no modifica premios ya guardados.

## Ejemplo de colección

Un alumno recibe Pikachu al registrarse y obtiene Pikachu, Caterpie y Pikachu al canjear el QR del docente:

| Especie | Cantidad | Protegidos | Intercambiables sin reservas |
|---|---:|---:|---:|
| Pikachu | 3 | 1 | 2 |
| Caterpie | 1 | 1 | 0 |

Tiene **cuatro ejemplares**, **dos especies únicas** y dos ejemplares disponibles para intercambio.

## QR del docente e intercambios

| Regla | PokéDrop del docente | QR de intercambio |
|---|---|---|
| Finalidad | Entregar tres ejemplares aleatorios | Ofrecer un duplicado a otro alumno |
| Uso | Un canje por alumno y por PokéDrop | Una propuesta válida por oferta |
| Vigencia inicial | 30 minutos por defecto, configurable | 60 segundos para presentar propuesta |
| Después de participar | Se recuperan los mismos tres resultados ante reintentos | La propuesta tiene 120 segundos para ser aceptada |
| Cantidad de participantes | Sin cupo global de alumnos en el MVP | Dos alumnos distintos |

El docente comparte QR, enlace o código desde su entrega. El alumno puede abrir el enlace, pegar el enlace o el código o pulsar **Escanear QR**. Si no concede acceso a la cámara, el enlace y el código siguen disponibles.

Consultar un QR no entrega ni transfiere ejemplares. El servidor valida sesión, permisos, estado y vencimiento antes de cada mutación. La vigencia del QR de intercambio y el plazo de la propuesta son independientes.

Estados del intercambio: `open → pending → completed`, con salidas finales `rejected`, `cancelled` o `expired` según la etapa. Los ejemplares reservados se liberan al cerrar la operación.

## MVP de la jornada

1. Registro con ID de SENATI, nombres, apellidos y fecha de nacimiento; alias generado, perfil con edad y foto opcional; inicio/cierre de sesión y cuenta docente.
2. Inicial aleatorio, Mew y Mewtwo con probabilidad del 0,1 % cada uno, catálogo de 151 especies, colección agrupada y Pokédex con meta principal de 150.
3. PokéDrops de tres ejemplares: creación, canje único, consulta y cancelación.
4. QR de intercambio, propuestas, reservas, aceptación e historial.
5. Ranking por especies únicas y panel administrativo básico.
6. Interfaz móvil, PWA y despliegue HTTPS en Cloudflare.

Las actualizaciones se realizan por HTTP. Las pantallas activas de intercambio consultan el estado cada tres segundos; colección y ranking se refrescan tras cambios y al volver a sus pantallas.

Quedan fuera de hoy: WebSockets, Durable Objects, rarezas y probabilidades configurables, logros, niveles, chat, notificaciones push, equipos, misiones, premios de especies específicas y estadísticas avanzadas.

## Arquitectura prevista

La [arquitectura técnica completa](ARQUITECTURA.md) define las decisiones, responsabilidades, experiencia visual y sonora, estructura del código, pruebas y fases de entrega. Se adopta un **monolito modular**, con un repositorio y un despliegue que sirve la interfaz y `/api` desde el mismo dominio.

| Área | Tecnologías previstas |
|---|---|
| Interfaz | React, TypeScript, Vite, Tailwind CSS, Lucide React y shadcn/ui. |
| Navegación, datos y formularios | React Router, TanStack Query, React Hook Form y Zod. |
| Animaciones y sonidos | Motion para React y Howler.js; sonido desactivado inicialmente y movimiento reducido respetado. |
| QR y fotos | qrcode.react, qr-scanner y react-easy-crop con exportación mediante Canvas. |
| Backend y persistencia | Hono en Cloudflare Workers, D1 con Drizzle ORM y R2 privado. |
| PWA y pruebas | vite-plugin-pwa, Vitest con integración de Workers y Playwright. |

```text
React + Vite + TypeScript + Tailwind CSS
          │ HTTPS
          ▼
Cloudflare Worker + Hono — API y archivos estáticos
          │
          ▼
Cloudflare D1 — cuentas, perfiles, colecciones y operaciones

Cloudflare Worker ── Cloudflare R2 — fotos de perfil privadas

PokéAPI — fuente inicial del catálogo y las imágenes
```

El backend controla sorteos, propiedad, protección, reservas y permisos. PokéAPI aporta información descriptiva; no se consulta para decidir o confirmar cada premio.

Cada ejemplar tiene identidad propia. El historial conserva su origen y cambios de propietario. Registro, canjes e intercambios deben ser atómicos y seguros ante reintentos y solicitudes simultáneas.

La autenticación usa ID de SENATI y contraseña, con sesión en cookie segura. La cuenta docente se provisiona fuera del registro público. El MVP funciona con una sola clase.

La PWA cachea su shell, pero las consultas actualizadas y todas las operaciones del juego requieren conexión. No se encolan intercambios ni canjes offline.

## Persistencia y API de perfiles

El esquema y sus migraciones ya están implementados. El [modelo de datos](docs/DATOS.md) detalla tablas, restricciones y límites; la API de autenticación y perfil privado está disponible; las demás rutas se incorporan en sus issues:

| Entidad | Información persistida |
|---|---|
| `users` | ID interno, `senati_id` normalizado y único, `first_names`, `last_names`, `birth_date`, `trainer_name`, clave normalizada única del alias, `trainer_name_version`, hash de contraseña, rol, referencia de avatar, versión de perfil y fechas de creación/actualización. |
| `sessions` | Hash de token, usuario, vencimiento y revocación. |
| `avatar_uploads` | ID de operación, usuario, clave de idempotencia única por usuario, huella del archivo, clave de R2, tipo, tamaño, dimensiones, versión de perfil esperada, estado, fechas y último error. |
| `media_cleanup_jobs` | Objeto candidato a eliminar, motivo, estado y reintentos; nunca elimina la foto actualmente referenciada. |
| `pokemon_instances` | ID del ejemplar, especie, propietario, protección, versión, premio/posición de origen y fecha de emisión/adquisición. La versión de probabilidades se conserva en el premio relacionado (`reward_grants`). |
| Registro, canjes e intercambios | Recompensa inicial única, canje único por evento/alumno con sus tres resultados, reservas y cambios de propietario. |

`users.age` no existe: la edad se calcula en las respuestas privadas. Los objetos de R2 están asociados a una operación y a un usuario; ninguna foto se considera persistida solamente por estar en memoria o en `localStorage`.

Registro, login/logout, sesión, perfil editable, fotos privadas, colección propia, PokéDrops y consulta docente individual están implementados. El listado paginado sigue pendiente. Ver [perfil editable](docs/PERFIL.md). Ver [contratos y seguridad](docs/AUTENTICACION.md).

| Método y ruta | Contrato |
|---|---|
| `POST /api/auth/register` | Recibe `senatiId`, `firstNames`, `lastNames`, `birthDate` y `password`; crea cuenta, alias e inicial. No acepta rol, alias o Pokémon impuestos por el cliente. |
| `POST /api/auth/login` | Recibe `senatiId` y `password`; recupera la misma cuenta y colección. |
| `POST /api/auth/logout` | Revoca la sesión actual. |
| `GET /api/auth/session` | Devuelve ID interno, rol y vencimiento de la sesión autenticada. |
| `POST /api/admin/drops` | Crea una entrega docente idempotente; 30 minutos por defecto (1–1440). |
| `GET /api/admin/drops` | Últimas 50 entregas propias y cantidades de canjes. |
| `GET /api/admin/drops/:id` | Recupera detalle y código para el docente creador. |
| `POST /api/admin/drops/:id/cancel` | Cancela nuevos canjes sin revocar premios existentes. |
| `POST /api/drops/preview` | Consulta un código y recupera el premio previo del alumno; no entrega ejemplares. |
| `POST /api/drops/redeem` | Canje atómico de tres ejemplares; el reintento devuelve el mismo premio. |
| `GET /api/me/collection` | Colección del alumno autenticado: cantidades agrupadas, protegidos, reservas activas, disponibles y progreso #001–#150; Mew adicional. |
| `GET /api/me` | Devuelve perfil propio, edad calculada, alias, URL interna de foto y versión de perfil. Nunca devuelve el hash de contraseña. |
| `PATCH /api/me/profile` | Guarda nombres, apellidos y fecha de nacimiento propios con validación y control de versión; no cambia ID de SENATI ni alias. |
| `PUT /api/me/avatar` | Carga la imagen normalizada con clave de idempotencia y versión esperada; devuelve la referencia confirmada y nueva versión. Misma clave con otro archivo devuelve conflicto. |
| `DELETE /api/me/avatar` | Quita la foto propia con control de versión y programa su eliminación; muestra avatar predeterminado. |
| `GET /api/users/:id/avatar` | Sirve la foto vigente a usuarios autenticados de la clase, o avatar predeterminado cuando no existe. |
| `GET /api/admin/users` | Lista paginada de alumnos para el profesor, con ID de SENATI, nombres, apellidos, alias y edad calculada. |
| `GET /api/admin/users/:id` | Permite al profesor consultar el perfil del alumno, incluida su fecha de nacimiento. |

Las actualizaciones rechazan versiones antiguas con `409` y no sobrescriben silenciosamente cambios de otro dispositivo. Registro y perfil deben funcionar aunque el alumno no suba una foto. La recuperación automática de contraseña y corrección administrativa del ID quedan fuera de esta versión.

Referencias de infraestructura: [acceso a R2 desde Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) y [transacciones de D1 mediante batch](https://developers.cloudflare.com/d1/worker-api/d1-database/). El plan separa persistencia relacional y archivos, y exige compensación y limpieza cuando una operación involucra ambos servicios.

## Orden de implementación

1. Crear proyecto, Worker, D1, bucket privado R2 y despliegue mínimo.
2. Preparar migraciones de cuentas, perfiles y juego; catálogo #001–#151 y distribución de probabilidades.
3. Implementar registro SENATI, alias persistente, autenticación, cálculo de edad y entrega inicial única.
4. Implementar edición de perfil, foto opcional en R2 y limpieza de cargas/borrados pendientes.
5. Implementar colección, Pokédex y duplicados.
6. Implementar PokéDrops para obtener tres ejemplares adicionales.
7. Implementar intercambio completo y verificar concurrencia.
8. Completar ranking y administración; incorporar animaciones, audio opcional, PWA y verificación móvil según las [fases de entrega](ARQUITECTURA.md#fases-de-entrega).

El objetivo es entregar este flujo funcional durante la jornada. La integridad de canjes e intercambios forma parte del MVP; el acabado visual puede simplificarse para priorizarlo.

## Validación mínima de entrega

- [ ] El registro exige ID de SENATI, nombres, apellidos, contraseña y fecha de nacimiento válida.
- [ ] El ID conserva ceros iniciales y una restricción única impide cuentas duplicadas incluso bajo concurrencia.
- [ ] El alias se genera solo en el servidor, es único y permanece igual al recargar o cambiar de dispositivo.
- [ ] Nombres compuestos y tildes se guardan sin alteraciones indebidas.
- [x] La edad es correcta antes y después del cumpleaños, al cambiar de año y para nacimientos del 29 de febrero.
- [ ] Nombres, apellidos y fecha corregidos persisten; las versiones evitan sobrescrituras concurrentes.
- [ ] Ranking e intercambios no exponen ID de SENATI, nombres legales, fecha de nacimiento ni edad.
- [x] La cuenta y el inicial funcionan sin foto o si la carga falla.
- [x] La foto se recupera después de cerrar sesión, reiniciar el navegador o entrar desde otro dispositivo.
- [x] Cargas inválidas se rechazan; un alumno no puede modificar la foto de otro.
- [x] Sustituir o eliminar una foto actualiza el perfil; las tareas de limpieza no eliminan archivos vigentes.
- [x] Un fallo entre R2 y D1 y un reintento de carga no dejan una referencia rota ni varias operaciones confirmadas.
- [x] Inicial y PokéDrops comparten probabilidades: Mewtwo 0,1 %, Mew 0,1 % y otras 149 especies 99,8 % en conjunto.
- [x] Casos controlados verifican las tres ramas del sorteo y permiten Mew y Mewtwo repetidos sin exigir su aparición en una muestra aleatoria.

- [x] Un inicial más un PokéDrop producen cuatro ejemplares, admitiendo repetidos.
- [x] Cinco Pikachu se muestran como cantidad 5 y una especie en la Pokédex.
- [x] El inicial y los PokéDrops solo generan IDs del 1 al 151, incluidos Mew y Mewtwo.
- [ ] Mew se guarda y muestra en la colección y como entrada adicional en la Pokédex; sus duplicados se intercambian, pero no modifican el progreso ni el ranking de los primeros 150.
- [x] Reintentar un registro o canje no duplica recompensas.
- [ ] Solo pueden intercambiarse duplicados propios y disponibles.
- [ ] La aceptación transfiere ambos ejemplares o ninguno, una sola vez.
- [ ] Expiración, rechazo y cancelación liberan reservas.
- [ ] El profesor puede crear PokéDrops y consultar alumnos y canjes.
- [ ] El ranking cuenta especies únicas y respeta empates.
- [ ] El flujo completo funciona por HTTPS con un docente y dos alumnos.

Las pruebas de repetidos usan datos controlados para verificar reglas sin depender del azar de producción.

## Documentación y ejecución

Este README define registro, perfiles persistentes, reglas, probabilidades, alcance del MVP y criterios de aceptación. [ARQUITECTURA.md](ARQUITECTURA.md) complementa esas reglas con las decisiones técnicas, bibliotecas, experiencia visual y sonora, organización del código y estrategia de validación. Colección y PokéDrops están implementados; intercambios y ranking siguen pendientes. La base, el esquema D1 y sus comandos se detallan a continuación; [DATOS.md](docs/DATOS.md) documenta migraciones y garantías de almacenamiento.

### Requisitos e instalación

Usar **Node.js 24** (definido en `.nvmrc`) y npm. Las versiones directas están fijadas en `package.json` y las dependencias completas en `package-lock.json`.

```sh
nvm use
npm ci
npm run db:migrate:local
npm run dev
```

Vite inicia la aplicación y el Worker local en `http://127.0.0.1:5173` si el puerto está disponible. No hace falta iniciar un backend separado. El desarrollo y las pruebas usan el runtime local de Workers; no requieren credenciales de producción.

### Comandos disponibles

| Comando | Función |
|---|---|
| `npm run dev` | Desarrollo de React y Worker con recarga local. |
| `npm run typecheck` | Comprobar TypeScript. |
| `npm run lint` | Revisar código con ESLint. |
| `npm run format` | Formatear código y configuración con Prettier. |
| `npm run format:check` | Comprobar formato de código y configuración. |
| `npm run test:ui` | Recorridos de navegador sobre el build previo; requiere `npx playwright install chromium webkit`. |
| `npm test` | Ejecutar pruebas de la API dentro del runtime Workers con Vitest. |
| `npm run build` | Comprobar tipos y compilar cliente y Worker en `dist/`. |
| `npm run check` | Ejecutar formato, lint, historial de migraciones, pruebas y build; también se ejecuta en GitHub Actions. |
| `npm run preview` | Servir localmente el build de producción después de `npm run build`. |
| `npm run smoke -- http://127.0.0.1:5173` | Comprobar SPA, fallback y API contra el servidor iniciado. Acepta también una URL HTTPS. |
| `npm run cf:types` | Generar tipos locales de Wrangler tras cambios de bindings; typecheck y build lo ejecutan automáticamente. |
| `npm run catalog:import` | Importar las revisiones fijadas de PokéAPI; uso de mantenimiento con red. |
| `npm run catalog:check` | Validar catálogo e imágenes locales sin red; incluido en CI. |
| `npm run db:generate` | Generar una nueva migración SQL desde el esquema Drizzle. |
| `npm run db:check` | Comprobar el historial de migraciones de Drizzle. |
| `npm run db:migrate:local` | Aplicar migraciones a D1 local. |
| `npm run db:migrations:list` | Consultar migraciones pendientes en D1 local. |
| `npm run db:migrate:test` | Aplicar migraciones a la base remota de pruebas. |
| `npm run db:migrate:remote` | Aplicar migraciones revisadas a la base de producción. |
| `npm run smoke:auth:ui -- <url> <credenciales.json>` | Verificar acceso docente real en navegador, sin capturas ni trazas privadas. |
| `npm run teacher:create -- --production --input .local/docente.json` | Provisionar docente mediante CLI, sin endpoint público; credenciales en archivo privado. |
| `npm run smoke:auth -- URL ARCHIVO` | Verificar login y cierre con las credenciales locales de un docente. |
| `npm run deploy` | Compilar y publicar con el Wrangler local del proyecto. |

### API y alcance de la base

`GET /api/health` devuelve `200` con `{"status":"ok","service":"pokeswap-classroom"}` y `Cache-Control: no-store`. Solo indica que el Worker responde; no verifica base de datos, almacenamiento ni disponibilidad del juego.

Las rutas `/api` y `/api/*` pasan primero por Hono. Las rutas de API inexistentes devuelven `404` JSON después de los controles de acceso aplicables, incluso al abrirlas directamente en el navegador. El resto usa los archivos estáticos y fallback SPA. React Router resuelve las rutas de cliente: inicio y catálogo son públicos; registro/login están conectados y las rutas privadas exigen sesión y rol. El perfil propio y el inicial se recuperan de D1. Las rutas desconocidas muestran una página 404; las funciones restantes muestran su disponibilidad.

Las pruebas de humo verifican inicio, colección, Pokédex, ruta docente, fallback SPA, `/api/health`, API inexistente e imágenes del catálogo. Playwright comprueba las interacciones en Chromium y WebKit; las funcionalidades restantes siguen su orden de issues.

### Despliegue y credenciales

**Base publicada:** [PokéSwap Classroom](https://pokeswap-classroom.christian-ar-valo-jes-s.workers.dev) · [Salud de la API](https://pokeswap-classroom.christian-ar-valo-jes-s.workers.dev/api/health). Incluye navegación adaptable, Pokédex pública, registro/login, perfil e inicial persistentes. La colección incluye cantidades, reservas y progreso. Los PokéDrops incluyen QR, enlace y código, con cámara bajo demanda y confirmación de canje. Los intercambios siguen pendientes.

La configuración está en `wrangler.jsonc`; el Worker se llama `pokeswap-classroom`. Vite genera la configuración final del despliegue junto al build. Los scripts usan Wrangler instalado en el proyecto, sin depender de la versión global.

Para publicar desde otra máquina, iniciar sesión con `npx wrangler login`, verificar la cuenta con `npx wrangler whoami` y ejecutar `npm run deploy`. La integración continua valida las PR; todavía no publica automáticamente ni requiere secretos de Cloudflare en GitHub.

No se incluyen credenciales ni secretos en Git. `.local/`, `.env*`, `.dev.vars*`, `.wrangler/`, `dist/` y dependencias están excluidos. Esta base no requiere variables secretas. D1 está configurado con el binding `DB` y bases separadas para producción y pruebas. Validar migraciones localmente y en pruebas antes de aplicarlas a producción; `deploy` no las aplica automáticamente. Las pruebas de Vitest usan otra base temporal y no requieren acceso a tus bases remotas. R2 está configurado con buckets privados separados y limpieza programada; los servicios del juego siguen pendientes.

Referencia: [React y Vite en Cloudflare Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/).

### Nota sobre herramientas locales

En esta máquina, la precarga de Console Lens mediante `NODE_OPTIONS` truncó el HTML servido por `preview`. La comprobación pasó al iniciar temporalmente con `env -u NODE_OPTIONS npm run preview`; no se modificó la configuración global. Este diagnóstico es específico de esa precarga local y no afecta al despliegue HTTPS.
