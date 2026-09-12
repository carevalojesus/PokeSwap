# PokéDrops y canje único

Implementado en #11. El docente crea, consulta y cancela sus entregas en `/docente/pokedrops`; los alumnos consultan y canjean un código en `/pokedrops`. La #12 añade QR y enlace compartibles y cámara bajo demanda. No se añaden migraciones; se fijan qrcode.react 4.2.0 y qr-scanner 1.4.2.

## Contratos

Todas las rutas requieren sesión, son `no-store` y verifican el rol. Las mutaciones y consultas por código usan JSON con límite de 8 KiB y origen del mismo sitio. Los códigos viajan hacia la API en el cuerpo, nunca en rutas o parámetros de consulta. Los enlaces compartidos usan un fragmento, que no se envía por HTTP ni en Referer. Al abrirlo se elimina de la entrada actual del historial y se conserva en memoria, sin localStorage/sessionStorage. Esto no elimina copias previas del enlace en aplicaciones de mensajería o historiales externos.

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

Playwright cubre creación y recuperación, cancelación confirmada, consulta antes de canjear, respuesta perdida, recarga, actualización de colección, estados inactivos, contrato inválido y cierre durante un canje. Revisión móvil en Chromium/WebKit emulados y escritorio; el 12/09/2026 el usuario confirmó «todo ok» tras la prueba solicitada en teléfono físico: denegación con alternativa utilizable y apagado al cerrar/salir. No informó modelo ni navegador; esta evidencia es una confirmación del usuario, no una prueba física ejecutada por el agente.

`npm run smoke:drops:ui -- https://pokeswap-drops-ui-XXXXXXXX.christian-ar-valo-jes-s.workers.dev <credenciales-docente-test.json> chromium` comprueba por HTTPS un docente y dos alumnos ficticios, canjes concurrentes, colección de cuatro ejemplares, cancelación y recuperación. Admite `webkit`; rechaza producción y credenciales docentes ajenas al entorno de pruebas. El Worker temporal debe usar únicamente D1/R2 y clave de pruebas; eliminarlo después de validar. No crea premios de prueba en producción.

## QR, enlaces y cámara (#12)

El docente obtiene el QR y el enlace en el detalle de una entrega activa. El QR SVG incluye margen de cuatro módulos y corrección M; se genera localmente, sin servicios externos. Su vencimiento es el de la entrega, verificado en D1. Cancelar o vencer oculta las opciones de compartir; un enlace ya copiado sigue consultando el estado real sin permitir nuevos canjes.

`/pokedrop#<código>` permite entrar o registrar una cuenta de alumno sin perder el código durante la navegación del formulario. Consultar sigue siendo una acción explícita. Recargar después de limpiar el fragmento requiere abrir de nuevo el enlace original o pegar el código. Un docente no puede canjear. Un QR ajeno, una ruta de intercambio, parámetros extra o una URL con credenciales se rechazan sin navegar ni llamar a la API.

La cámara trasera se solicita solo al pulsar **Escanear QR**; no se enumera ni activa al cargar. El escáner y su motor se cargan en chunks separados. Al reconocer un código válido, detener/cerrar, consultar, salir, ocultar la pestaña o verificar/cambiar sesión se liberan pistas y motor. Un permiso tardío también libera su stream. Tras una denegación se informa cómo continuar por enlace/código o volver a habilitar el permiso. No se envían fotogramas al servidor.

`tests/ui/qr.spec.ts` decodifica el QR realmente renderizado con el motor compilado, verifica login/registro con enlace, ausencia de tokens en HTTP/almacenamiento, consultas sin premios y denegación simulada en Chromium/WebKit. Los streams de Canvas en Chromium verifican lectura y liberación de pistas, incluida concesión tardía. Esos casos de Canvas se omiten expresamente en WebKit; no equivalen a usar una cámara física.

Protocolo físico solicitado y confirmado por el usuario el 12/09/2026: desde el Worker HTTPS de pruebas, crear una cuenta ficticia, abrir PokéDrops, pulsar Escanear QR y denegar permiso; comprobar el aviso y el formulario utilizable. Después permitir la cámara y comprobar que su indicador se apaga al cerrar el escáner o salir. Resultado informado: «todo ok». Modelo y navegador no especificados. No se atribuye a esta confirmación una lectura óptica física del QR, que sí se verifica con streams sintéticos y decodificación del PNG renderizado.
