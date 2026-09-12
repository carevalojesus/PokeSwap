# Modelo de datos y migraciones D1

La issue #2 establece el esquema de almacenamiento. Los endpoints de registro, premios, perfiles e intercambios siguen pendientes en sus respectivas issues. Las reglas funcionales están en el [README](../README.md) y el diseño general en [ARQUITECTURA.md](../ARQUITECTURA.md).

## Fuentes del esquema

- `src/server/db/schema.ts`: tablas, tipos, claves, índices y restricciones declaradas con Drizzle.
- `migrations/0000_schema.sql`: esquema generado y revisado.
- `migrations/0001_integrity_guards.sql`: triggers revisados para invariantes entre filas que SQLite no permite en un `CHECK`.
- `migrations/meta/`: snapshots e historial de generación de Drizzle, versionados junto al SQL.
- `src/server/db/client.ts`: adaptador Drizzle construido por solicitud desde el binding `DB`.

Drizzle genera el SQL; **Wrangler aplica las migraciones** y registra las ya aplicadas en `d1_migrations`. No ejecutar simultáneamente un migrador de Drizzle sobre la misma base ni usar `drizzle-kit push` como sustituto de las migraciones revisadas. [Drizzle Kit](https://orm.drizzle.team/docs/kit-overview), [migraciones D1](https://developers.cloudflare.com/d1/reference/migrations/).

## Tablas y responsabilidades

| Tabla                | Contenido y garantías principales                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`              | ID SENATI como texto único; nombres y nacimiento; alias y clave normalizada única; versión del generador; hash de contraseña; rol; referencia de avatar y versión de perfil.      |
| `sessions`           | Hash hexadecimal SHA-256 de token, propietario, creación, expiración y revocación. No almacena el token original.                                                                 |
| `pokemon_species`    | IDs #001–#151, nombre e imagen. La migración `0002_kanto_catalog.sql` de #3 inserta las 151 especies.                                                                             |
| `poke_drops`         | Docente creador, hash de token, expiración, cancelación y versión. El canje siempre entrega tres ejemplares según las reglas.                                                     |
| `reward_grants`      | Operación de premio inicial o canje de PokéDrop, beneficiario, cantidad de sorteos y versión de probabilidades. Un inicial por usuario y un canje por usuario/PokéDrop.           |
| `pokemon_instances`  | Ejemplar individual, especie, propietario actual, premio y posición de origen, protección, versión y fechas. No se agrega unicidad por propietario/especie que impida duplicados. |
| `trades`             | Oferta y propuesta de dos alumnos distintos, ejemplares, token, estado, versión y plazos independientes. Conserva participantes y ejemplares al cerrar.                           |
| `trade_reservations` | Solo reservas activas: un ejemplar no puede tener dos reservas y cada intercambio tiene como máximo una por lado. La expiración no elimina por sí sola la fila.                   |
| `instance_events`    | Emisión o transferencia, ejemplar, versión, origen/destino y premio/intercambio relacionado. Una entrada por versión y ejemplar; no repite el evento del mismo intercambio.       |
| `avatar_uploads`     | Operación de carga, clave de idempotencia por usuario, huella, clave R2 única, metadatos WebP, versión esperada, estado y error.                                                  |
| `media_cleanup_jobs` | Limpieza de un objeto conocido, motivo, reintentos y fechas. Una tarea activa por objeto; procesamiento con vencimiento de lease para recuperar tareas abandonadas.               |
| `transaction_guards` | Aserciones transitorias de un lote D1. `ok` solo admite `1`; una aserción falsa aborta el lote. Un lote exitoso elimina sus propias aserciones antes de confirmar.                |

No existe una columna de edad. Las fechas de nacimiento se almacenan como `YYYY-MM-DD`; los demás instantes son enteros Unix en **segundos**. Las comparaciones con el momento actual, los cumpleaños en Lima y las fechas futuras se validarán en los servicios. Los plazos se calculan en el servidor; no se acepta el reloj del cliente como autoridad.

El origen y la versión de probabilidades del ejemplar se obtienen mediante `pokemon_instances.grant_id → reward_grants`. La especie y la procedencia permanecen iguales al intercambiar; solo cambian el propietario, la fecha de adquisición, la versión y, cuando corresponda, la protección del nuevo propietario.

## Invariantes y límites

### Identidad

La base conserva ceros iniciales y rechaza IDs duplicados, alias normalizados duplicados, roles desconocidos y fechas de calendario inválidas. Los nombres legales pueden repetirse. La normalización Unicode completa, todos los caracteres de control, límites de entrada y rechazo de fechas futuras siguen siendo responsabilidad del servicio de registro/perfil. SQLite `upper()` no sustituye la normalización del servidor.

La columna `password_hash` guarda el formato completo scrypt con sal y parámetros seleccionado en #4; ver [registro](REGISTRO.md). Los hashes de tokens de sesión y QR se guardan como 64 caracteres hexadecimales minúsculos. La aleatoriedad, distribución segura y la entrega de los tokens se implementarán con sus servicios; almacenar un hash no convierte un código débil en seguro.

### Premios y ejemplares

Los premios iniciales admiten un solo resultado, posición `0`; los PokéDrops, posiciones `0`, `1` y `2`. La clave única `(grant_id, grant_slot)` impide emitir de nuevo la misma posición. El trigger verifica que el primer propietario sea el beneficiario del premio. El índice parcial de iniciales y el de canjes resuelven duplicados incluso bajo concurrencia.

El primer ejemplar de una especie se debe insertar protegido; los posteriores, sin protección. El índice parcial permite un único protegido por propietario/especie. Los triggers impiden transferir, desproteger o borrar esa copia. Cuando llega una especie nueva por transferencia, el servicio debe marcar protegido el ejemplar recibido; el trigger valida esa decisión. No se cambia la protección para elegir otro ejemplar.

El esquema limita el máximo de resultados, pero no impone por sí solo que un premio ya tenga **todos** sus resultados. Registro y canje deberán crear cuenta/premio/ejemplares/historial dentro de un único `DB.batch()`, comprobando el total esperado antes de confirmar. No se debe confirmar un premio vacío para rellenarlo en otra solicitud. La prueba de esta issue demuestra que fallar al insertar un ejemplar revierte también la creación de su premio en el mismo lote.

### Intercambios y reservas

Se conserva `open → pending → completed`, con cierres `rejected`, `cancelled` o `expired`. Los `CHECK` impiden estados desconocidos, propuestas incompletas, intercambios consigo mismo y cierres sin fecha. `offer_expires_at` y `proposal_expires_at` son distintos: la propuesta debe presentarse antes de vencer la oferta; la aceptación usa el plazo de la propuesta.

Al crear una reserva, el trigger verifica propietario, duplicado disponible, correspondencia con la oferta/propuesta y plazo asociado. La clave primaria sobre `instance_id` evita reservar el mismo ejemplar en dos operaciones. Las reservas no guardan una FK compuesta hacia el propietario actual del ejemplar: una transferencia cambia ese propietario dentro del lote antes de liberar la reserva.

Los servicios de #13/#14 deben validar permisos, reloj actual, transiciones, versiones, ambas reservas y reglas de cierre. Las restricciones de forma no constituyen una máquina de estados completa ni autorizan solicitudes. Para liberar una reserva vencida, resolver atómicamente la operación y borrar las filas correspondientes; no depender únicamente del cron.

### Fotos y limpieza

`users.avatar_object_key` referencia una carga existente. Un trigger exige que sea del mismo usuario y esté `stored` o `committed`. La cuenta debe crearse sin avatar, luego cargarlo y confirmar la referencia. La FK impide borrar el registro de carga mientras el perfil lo referencia; no demuestra que el objeto siga existiendo en R2.

Los metadatos exigen WebP 512 × 512, entre 1 byte y 1 MiB. Esto no reemplaza la validación del archivo real en el Worker. La clave de idempotencia es única por usuario; el servicio debe recuperar el resultado existente y devolver conflicto si cambia la huella. Las claves, propietario y huella de una operación ya creada no se reescriben.

Los estados son `pending` (operación registrada), `stored` (R2 confirmó la carga), `committed` (referencia confirmada) y `failed` (operación fallida). Las transiciones y el control de versión del perfil se implementarán en #9. No existe una transacción conjunta de D1 y R2.

Antes de borrar un objeto, la tarea de limpieza debe verificar referencias y cargas activas. La tabla controla unicidad y reintentos; no concede permiso para borrar una foto vigente. Los registros de cargas y trabajos completados se conservan mientras sean necesarios para trazabilidad y reintentos.

## Precondiciones atómicas en D1

`DB.batch()` revierte el lote si una sentencia falla, pero un `UPDATE` que modifica cero filas **no es un error SQL**. Por ello, comprobar cantidades después de confirmar sería insuficiente. [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/).

El patrón probado es introducir la aserción **inmediatamente después** de la sentencia que se quiere comprobar, dentro del mismo lote:

```sql
UPDATE pokemon_instances
SET owner_id = ?, version = version + 1, acquired_at = ?, is_protected = ?
WHERE id = ? AND owner_id = ? AND version = ? AND is_protected = 0;

INSERT INTO transaction_guards (id, ok)
VALUES (?, changes() = 1);
```

Los parámetros son valores del servidor y las claves de guard son únicas por intento y por aserción. Si la actualización no modifica exactamente una fila, `CHECK(ok = 1)` falla y revierte también las escrituras anteriores del lote. No intercalar otra escritura entre el `UPDATE` y la aserción: cambiaría el valor de `changes()`.

La aceptación de #14 deberá construir **un solo lote** con este orden lógico:

1. Aserción `CASE WHEN EXISTS (...) THEN 1 ELSE 0 END` que compruebe intercambio pendiente, actor autorizado, plazo vigente, versiones, propietarios y dos reservas válidas. El servicio recupera primero un resultado ya completado para responder idempotentemente al usuario autorizado.
2. Transferencia condicional del primer ejemplar, asignación de protección conforme a la colección de destino y aserción de una fila modificada.
3. Transferencia condicional del segundo ejemplar y su aserción.
4. Inserción de los dos eventos de historial, con unicidad por intercambio/ejemplar.
5. Cierre condicional del intercambio y aserción; liberación de sus dos reservas y aserción del número esperado.
6. Eliminación de las aserciones de ese lote. La respuesta de éxito se envía solo después de que el lote completo confirme.

Las pruebas de #2 demuestran el mecanismo de reversión y la competencia entre dos lotes sobre las mismas versiones. **No implementan todavía la aceptación de intercambios**: la autorización, los plazos, las reservas y el historial completo se incorporan y prueban en #14. No usar `BEGIN/COMMIT` manual ni asumir que `db.transaction()` interactivo está disponible por usar Drizzle.

## Entornos y comandos

| Entorno        | Binding y almacenamiento                                       | Uso                                                                                   |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Desarrollo     | `DB`, SQLite local en `.wrangler/state`                        | Probar servicios con `npm run dev`.                                                   |
| Vitest         | `DB`, base aislada `pokeswap-unit-tests` en el runtime Workers | Aplicar las migraciones reales a almacenamiento temporal; no conecta a bases remotas. |
| Pruebas remoto | `DB` en `env.test`, `pokeswap-classroom-test`                  | Verificar migraciones en Cloudflare antes de producción.                              |
| Producción     | `DB`, `pokeswap-classroom-db`                                  | Base vinculada al Worker publicado.                                                   |

Las bases remotas tienen IDs distintos en `wrangler.jsonc`; esos identificadores no son credenciales. R2 no se provisiona en esta issue. Las migraciones no incluyen datos de alumnos. La migración 0002 carga el catálogo público; los fixtures de cuentas y operaciones solo se insertan en la base temporal de Vitest.

```sh
npm run db:generate
npm run db:check
npm run db:migrate:local
npm run db:migrations:list
npm run check
npm run db:migrate:test
npm run db:migrate:remote
npm run deploy
```

Ejecutar los comandos remotos solo sobre cambios revisados y después de validar en pruebas. `deploy` no aplica migraciones automáticamente. `db:check` valida el historial de Drizzle; las pruebas que aplican SQL en D1 son las que verifican su ejecución y restricciones. `db:generate` debe indicar que no hay cambios cuando fuente y snapshot coinciden.

Las migraciones publicadas son inmutables: crear la siguiente migración para cambios futuros. Para un trigger nuevo o modificado, usar `npx drizzle-kit generate --custom --name nombre_del_cambio` y escribir/revisar su SQL. Al reconstruir tablas, revisar también FKs, índices y triggers personalizados que el generador no conoce. Las migraciones de cambios destructivos requieren su propio plan de respaldo y recuperación.

## Validación y dependencias

Las pruebas ejercitan D1 real en el runtime local de Workers: migraciones idempotentes, FKs, fechas, unicidad, premios, reservas, protección, versiones, historial, cargas y limpieza. Usan datos ficticios identificados y separados por caso. El código de producción no importa los fixtures.

Drizzle ORM y Drizzle Kit están fijados a versiones estables. El `override` de `@esbuild-kit/core-utils → esbuild 0.25.12` corrige una dependencia antigua del cargador de Drizzle Kit; se verifican generación, comprobación, pruebas y build con esta resolución. No se usa una actualización forzada ni una versión RC del ORM.
