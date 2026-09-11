# PokéSwap Classroom

> Colecciona. Intercambia. Completa tu Pokédex.

PWA educativa para estudiantes de SENATI: recibe Pokémon aleatorios, acumula ejemplares y cambia tus repetidos con compañeros mediante códigos QR. El profesor distribuye nuevos Pokémon con PokéDrops.

**Estado actual:** documentación del MVP definida. El código, la configuración de infraestructura y el despliegue están pendientes. La jornada de desarrollo prevista es el 11 de septiembre de 2026.

**Autor:** [Christian Arevalo Jesus](https://github.com/carevalojesus).

Repositorio: [carevalojesus/PokeSwap](https://github.com/carevalojesus/PokeSwap).

## Reglas del juego

- La meta es completar las **150 especies del #001 al #150**.
- Cada alumno recibe **un inicial aleatorio entre cualquiera de los 150**. No está limitado a los tres iniciales tradicionales.
- El QR de bienvenida del docente entrega **tres Pokémon adicionales** por alumno en un único canje.
- Los sorteos son independientes, permiten repetidos y usan probabilidades fijas: Mewtwo es más difícil de obtener. El docente puede crear más PokéDrops para seguir entregando ejemplares.
- Registro más primer PokéDrop dejan al alumno con **cuatro ejemplares**, que pueden ser de especies iguales o diferentes.
- Los repetidos se acumulan: `Pikachu ×5` representa cinco ejemplares individuales, no cinco especies diferentes.
- Se protege un ejemplar por especie y solo se intercambian los sobrantes. Cinco Pikachu permiten ofrecer cuatro, si no hay reservas activas.
- Los intercambios son uno por uno, requieren propuesta y aceptación, y transfieren ambos ejemplares o ninguno.
- El ranking cuenta especies únicas; los alumnos con la misma cantidad comparten posición.
- Mew #151 queda fuera de esta versión y de todos sus sorteos.

No se fuerzan duplicados: si un alumno recibe cuatro especies diferentes, puede seguir coleccionando mediante PokéDrops hasta obtener ejemplares adicionales de alguna especie. No se garantiza completar los 150 durante una clase.

## Registro e identidad del alumno

Cada alumno completa estos campos al registrarse:

| Campo | Requisito y comportamiento |
|---|---|
| ID de SENATI | Obligatorio y único. Identifica la cuenta y se utiliza para iniciar sesión. |
| Nombres | Obligatorios; se admiten nombres compuestos, espacios y tildes. |
| Apellidos | Obligatorios en un campo independiente; se admiten apellidos compuestos. |
| Contraseña | Obligatoria; se guarda su hash con sal, nunca el texto original. |
| Fecha de nacimiento | Obligatoria, como fecha de calendario `YYYY-MM-DD`; permite mostrar la edad. |
| Nombre de entrenador | Lo genera el servidor; el alumno no tiene que inventarlo ni escribirlo. |
| Foto de perfil | Opcional; puede seleccionarse durante el registro o subirse y cambiarse después. |

El ID de SENATI se almacena como **texto**, conservando ceros iniciales. Se recortan espacios exteriores y se normalizan letras a mayúsculas; no se eliminan ceros ni separadores internos. Para el MVP se admite un valor de 1 a 32 caracteres sin espacios internos ni caracteres de control. No se presupone una longitud institucional fija ni se afirma verificar matrícula con SENATI: la validación local comprueba formato básico y unicidad.

Nombres y apellidos se recortan, normalizan espacios y conservan su escritura y tildes; cada campo admite de 1 a 100 caracteres y no acepta solo espacios. Dos alumnos pueden tener el mismo nombre completo, pero no el mismo ID de SENATI.

El registro guarda en una única operación de D1 la cuenta, el nombre de entrenador, el ejemplar inicial y su historial. La restricción única del ID evita cuentas y premios duplicados incluso ante solicitudes simultáneas. Un intento con un ID existente indica que debe iniciarse sesión; no reemplaza contraseña, datos ni colección. Recuperar el resultado de una cuenta existente requiere autenticarse.

Una vez confirmada la cuenta se establece la sesión. Si falla la entrega de la respuesta o la creación de la sesión, el alumno puede iniciar sesión con sus credenciales y recuperar el perfil y el mismo inicial ya guardados.

### Nombre de entrenador generado

Debe sonar a personaje del universo de entrenadores Pokémon y mantenerse estable durante el juego. Ejemplos de formato: **Kairo del Trueno · 7K4P** y **Lumion de la Aurora · 9R2M**. Son ejemplos; no nombres asignados a cuentas reales.

Algoritmo previsto, ejecutado en el servidor:

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

## Probabilidades y dificultad de Mewtwo

**Mewtwo #150 puede salir como inicial o en cualquiera de los tres sorteos de un PokéDrop, pero debe ser difícil de obtener.** Se fija este balance inicial para implementar el MVP:

| Resultado | Probabilidad por sorteo |
|---|---:|
| Mewtwo #150 | **0,1 %** |
| Conjunto de especies #001–#149 | **99,9 %**, distribuido por igual entre esas 149 especies |
| Mew #151 | **0 %**, excluido |

La probabilidad individual de cada especie #001–#149 es `99,9 % / 149`, aproximadamente `0,67047 %`. La distribución total suma 100 %. La dificultad especial de Mewtwo es una regla de este juego, no un valor tomado de PokéAPI. Las demás especies no tienen diferencias de rareza en este MVP.

Algoritmo del servidor: obtener un entero uniforme de 0 a 999 con aleatoriedad segura; si sale 0, entregar Mewtwo. En los otros 999 casos, sortear uniformemente un ID entre 1 y 149. La selección de enteros evita sesgo por aplicar módulo directamente a bytes aleatorios.

Se utiliza la misma función y configuración para el inicial y cada premio del docente. Cada sorteo es independiente, con reemplazo: un Mewtwo previo no aumenta ni reduce las probabilidades, y también puede salir repetido. Un primer Mewtwo queda protegido; un segundo puede intercambiarse bajo las reglas normales.

El 0,1 % es una probabilidad por intento, **no una entrega garantizada cada 1000 sorteos**. No se garantiza que Mewtwo aparezca en una clase ni que todos completen la Pokédex. No hay corrección de mala suerte ni premios forzados. El balance es una constante versionada en el backend, sin editor administrativo durante esta jornada; cambiarla en el futuro no modifica premios ya guardados.

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

Consultar un QR no entrega ni transfiere ejemplares. El servidor valida sesión, permisos, estado y vencimiento antes de cada mutación. La vigencia del QR de intercambio y el plazo de la propuesta son independientes.

Estados del intercambio: `open → pending → completed`, con salidas finales `rejected`, `cancelled` o `expired` según la etapa. Los ejemplares reservados se liberan al cerrar la operación.

## MVP de la jornada

1. Registro con ID de SENATI, nombres, apellidos y fecha de nacimiento; alias generado, perfil con edad y foto opcional; inicio/cierre de sesión y cuenta docente.
2. Inicial aleatorio, Mewtwo con probabilidad del 0,1 %, catálogo de 150 especies, colección agrupada y Pokédex.
3. PokéDrops de tres ejemplares: creación, canje único, consulta y cancelación.
4. QR de intercambio, propuestas, reservas, aceptación e historial.
5. Ranking por especies únicas y panel administrativo básico.
6. Interfaz móvil, PWA y despliegue HTTPS en Cloudflare.

Las actualizaciones se realizan por HTTP. Las pantallas activas de intercambio consultan el estado cada tres segundos; colección y ranking se refrescan tras cambios y al volver a sus pantallas.

Quedan fuera de hoy: WebSockets, Durable Objects, Mew, rarezas y probabilidades configurables, logros, niveles, chat, notificaciones push, equipos, misiones, premios de especies específicas y estadísticas avanzadas.

## Arquitectura prevista

```text
React + Vite + TypeScript
          │ HTTPS
          ▼
Cloudflare Worker — API y archivos estáticos
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

Estas tablas son parte del modelo previsto; sus migraciones todavía deben implementarse:

| Entidad | Información persistida |
|---|---|
| `users` | ID interno, `senati_id` normalizado y único, `first_names`, `last_names`, `birth_date`, `trainer_name`, clave normalizada única del alias, `trainer_name_version`, hash de contraseña, rol, referencia de avatar, versión de perfil y fechas de creación/actualización. |
| `sessions` | Hash de token, usuario, vencimiento y revocación. |
| `avatar_uploads` | ID de operación, usuario, clave de idempotencia única por usuario, huella del archivo, clave de R2, tipo, tamaño, dimensiones, versión de perfil esperada, estado, fechas y último error. |
| `media_cleanup_jobs` | Objeto candidato a eliminar, motivo, estado y reintentos; nunca elimina la foto actualmente referenciada. |
| `pokemon_instances` | ID del ejemplar, especie, propietario, origen, versión de probabilidades y fecha de emisión/adquisición. |
| Registro, canjes e intercambios | Recompensa inicial única, canje único por evento/alumno con sus tres resultados, reservas y cambios de propietario. |

`users.age` no existe: la edad se calcula en las respuestas privadas. Los objetos de R2 están asociados a una operación y a un usuario; ninguna foto se considera persistida solamente por estar en memoria o en `localStorage`.

| Método y ruta | Contrato previsto |
|---|---|
| `POST /api/auth/register` | Recibe `senatiId`, `firstNames`, `lastNames`, `birthDate` y `password`; crea cuenta, alias e inicial. No acepta rol, alias o Pokémon impuestos por el cliente. |
| `POST /api/auth/login` | Recibe `senatiId` y `password`; recupera la misma cuenta y colección. |
| `POST /api/auth/logout` | Revoca la sesión actual. |
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
2. Preparar migraciones de cuentas, perfiles y juego; catálogo #001–#150 y distribución de probabilidades.
3. Implementar registro SENATI, alias persistente, autenticación, cálculo de edad y entrega inicial única.
4. Implementar edición de perfil, foto opcional en R2 y limpieza de cargas/borrados pendientes.
5. Implementar colección, Pokédex y duplicados.
6. Implementar PokéDrops para obtener tres ejemplares adicionales.
7. Implementar intercambio completo y verificar concurrencia.
8. Completar ranking, administración, PWA y verificación móvil.

El objetivo es entregar este flujo funcional durante la jornada. La integridad de canjes e intercambios forma parte del MVP; el acabado visual puede simplificarse para priorizarlo.

## Validación mínima de entrega

- [ ] El registro exige ID de SENATI, nombres, apellidos, contraseña y fecha de nacimiento válida.
- [ ] El ID conserva ceros iniciales y una restricción única impide cuentas duplicadas incluso bajo concurrencia.
- [ ] El alias se genera solo en el servidor, es único y permanece igual al recargar o cambiar de dispositivo.
- [ ] Nombres compuestos y tildes se guardan sin alteraciones indebidas.
- [ ] La edad es correcta antes y después del cumpleaños, al cambiar de año y para nacimientos del 29 de febrero.
- [ ] Nombres, apellidos y fecha corregidos persisten; las versiones evitan sobrescrituras concurrentes.
- [ ] Ranking e intercambios no exponen ID de SENATI, nombres legales, fecha de nacimiento ni edad.
- [ ] La cuenta y el inicial funcionan sin foto o si la carga falla.
- [ ] La foto se recupera después de cerrar sesión, reiniciar el navegador o entrar desde otro dispositivo.
- [ ] Cargas inválidas se rechazan; un alumno no puede modificar la foto de otro.
- [ ] Sustituir o eliminar una foto actualiza el perfil; las tareas de limpieza no eliminan archivos vigentes.
- [ ] Un fallo entre R2 y D1 y un reintento de carga no dejan una referencia rota ni varias operaciones confirmadas.
- [ ] Inicial y PokéDrops comparten probabilidades: Mewtwo 0,1 %, otras 149 especies 99,9 % en conjunto y Mew 0 %.
- [ ] Casos controlados verifican las dos ramas del sorteo y permiten Mewtwo repetido sin exigir su aparición en una muestra aleatoria.

- [ ] Un inicial más un PokéDrop producen cuatro ejemplares, admitiendo repetidos.
- [ ] Cinco Pikachu se muestran como cantidad 5 y una especie en la Pokédex.
- [ ] El inicial y los PokéDrops solo generan IDs del 1 al 150.
- [ ] Reintentar un registro o canje no duplica recompensas.
- [ ] Solo pueden intercambiarse duplicados propios y disponibles.
- [ ] La aceptación transfiere ambos ejemplares o ninguno, una sola vez.
- [ ] Expiración, rechazo y cancelación liberan reservas.
- [ ] El profesor puede crear PokéDrops y consultar alumnos y canjes.
- [ ] El ranking cuenta especies únicas y respeta empates.
- [ ] El flujo completo funciona por HTTPS con un docente y dos alumnos.

Las pruebas de repetidos usan datos controlados para verificar reglas sin depender del azar de producción.

## Documentación y ejecución

Este README concentra la documentación vigente del proyecto: registro, perfiles persistentes, reglas, probabilidades, alcance del MVP y criterios de aceptación.

Todavía no existen comandos de instalación, desarrollo, migración ni despliegue disponibles en este repositorio local. Se documentarán aquí cuando estén implementados y verificados. No se deben incluir credenciales ni secretos en Git.
