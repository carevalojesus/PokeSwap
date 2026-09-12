# PokéDrops y canje único

Implementado en #11. El docente crea, consulta y cancela sus entregas en `/docente/pokedrops`; los alumnos consultan y canjean un código en `/pokedrops`. El QR, la cámara y los enlaces de entrada continúan en #12. No se añaden migraciones ni dependencias.

## Contratos

Todas las rutas requieren sesión, son `no-store` y verifican el rol. Las mutaciones y consultas por código usan JSON con límite de 8 KiB y origen del mismo sitio. Los códigos viajan en el cuerpo, nunca en rutas, parámetros de consulta o almacenamiento persistente del navegador.

| Ruta                               | Comportamiento                                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/admin/drops`            | Docente. `{ id: UUID, minutes?: entero }`; 30 minutos por defecto, rango 1–1440. Reintentar el mismo ID/duración recupera la misma entrega/código. |
| `GET /api/admin/drops`             | Últimas 50 entregas propias, estado y número de canjes. No incluye códigos ni datos de alumnos.                                                    |
| `GET /api/admin/drops/:id`         | Detalle y código recuperable exclusivamente para el docente creador.                                                                               |
| `POST /api/admin/drops/:id/cancel` | Cancelación idempotente de entrega propia; impide nuevos premios y conserva los ya entregados.                                                     |
| `POST /api/drops/preview`          | Alumno. `{ code }`; consulta estado y, si existe, su premio previo. No entrega ni modifica ejemplares.                                             |
| `POST /api/drops/redeem`           | Alumno. `{ code }`; devuelve los tres ejemplares persistidos del único canje por alumno/evento.                                                    |

El backend usa el usuario de la sesión. El cliente no puede imponer resultados, propietario, probabilidades ni rol. Las operaciones POST tienen un límite por cuenta de 8 solicitudes/minuto, independiente de la clave de login; un 429 devuelve `Retry-After`.

## Integridad y recuperación

Un canje inserta en un lote atómico D1 el premio, tres ejemplares y sus tres eventos de origen. Un guard SQL exige que la entrega siga activa, no haya vencido según `unixepoch()` de D1 y el receptor siga siendo alumno dentro de la escritura. Un fallo revierte todo el lote. El índice único `(drop_id, user_id)` resuelve dos canjes simultáneos; ambos recuperan el mismo premio ganador.

Los tres sorteos llaman a `drawPokemon`, la misma función versionada del inicial: Mewtwo y Mew 0,1 % cada uno, restantes 149 especies 99,8 % en conjunto. Se admiten repetidos. La protección de cada especie se evalúa en SQL al insertar cada posición, incluyendo duplicados dentro del mismo premio. El inicial más un canje son cuatro ejemplares.

La recuperación consulta primero el premio ya persistido, incluso después de cancelar o vencer la entrega. No vuelve a sortearlo. El resultado usa el origen inmutable del ejemplar, por lo que futuras transferencias no cambiarán la historia del premio. Consultar o repetir el canje no duplica recompensas. En una carrera con cancelación gana el orden atómico de D1: premio completo anterior a la cancelación, o ningún premio posterior.

La creación conserva un UUID en memoria hasta confirmarse; un reintento con la misma configuración devuelve el mismo registro. Si se recarga tras perder una respuesta, la entrega persistida aparece en el listado y su código se recupera desde el detalle. La cancelación puede consultarse o repetirse. La interfaz confirma solo respuestas validadas, impide doble envío y cancela peticiones al salir/cerrar sesión. Los premios confirmados invalidan la colección local y notifican a otras pestañas mediante el mecanismo de #10.

## Clave privada por entorno

`DROPS_TOKEN_SECRET` es un secreto de Worker de 32 bytes aleatorios representados por 64 caracteres hexadecimales. Se usa HMAC-SHA-256 sobre `pokeswap-drop:v1:<creatorId>:<dropId>` para generar un código recuperable; D1 almacena únicamente SHA-256 del código. El identificador público de la entrega no permite obtener el código sin la clave privada.

Para desarrollo, definirlo en `.dev.vars` (ignorado por Git). Producción y pruebas deben usar valores independientes configurados con `wrangler secret put DROPS_TOKEN_SECRET` o `wrangler secret bulk <archivo-privado.json>`. Un archivo bulk contiene la clave `DROPS_TOKEN_SECRET`; se crea con permisos 0600, nunca se imprime ni se añade a Git. No usar prefijo `VITE_` ni incluirlo en `vars` públicas. En esta instalación los respaldos operativos permanecen exclusivamente en `.local/`.

No regenerar la clave en cada despliegue. Cambiarla mantiene válidos los códigos ya compartidos (se verifican contra D1), pero impide reconstruirlos desde el detalle: este devuelve `code: null`. Antes de una rotación planificada conviene esperar el vencimiento o cancelar las entregas activas; conservar el respaldo para recuperación operativa. Los premios previos permanecen recuperables con su código original. Si falta la clave, crear/recuperar códigos falla de forma explícita; no se emiten códigos predecibles.

## Verificación

Pruebas D1: creación simultánea, mismo código tras reintento, huella almacenada, consulta sin premio, cuatro ejemplares con inicial, canjes simultáneos, dos alumnos, Mew/Mewtwo/repetidos, respuesta perdida, rollback por fallo de posición, cancelación durante el canje, vencimiento y permisos/origen/entrada.

Playwright cubre creación y recuperación, cancelación confirmada, consulta antes de canjear, respuesta perdida, recarga, actualización de colección, estados inactivos, contrato inválido y cierre durante un canje. Revisión móvil en Chromium/WebKit emulados y escritorio; teléfonos reales siguen en #20.

`npm run smoke:drops:ui -- https://pokeswap-drops-ui-XXXXXXXX.christian-ar-valo-jes-s.workers.dev <credenciales-docente-test.json> chromium` comprueba por HTTPS un docente y dos alumnos ficticios, canjes concurrentes, colección de cuatro ejemplares, cancelación y recuperación. Admite `webkit`; rechaza producción y credenciales docentes ajenas al entorno de pruebas. El Worker temporal debe usar únicamente D1/R2 y clave de pruebas; eliminarlo después de validar. No crea premios de prueba en producción.
