# Fotos privadas en R2

La tarea #9 añade selección, recorte, guardado y eliminación de foto en `/perfil`. La cuenta y el Pokémon inicial permanecen independientes de la foto. Las vistas futuras de compañeros podrán utilizar la misma ruta de imagen autenticada.

## Interfaz y formato

Se admiten JPEG, PNG y WebP de hasta 5 MiB; la previsualización limita las dimensiones decodificadas a 40 megapíxeles. `react-easy-crop` permite arrastrar, usar flechas y ajustar zoom. Canvas recorta a 512 × 512; exporta WebP con calidad 85. Si el navegador no codifica WebP nativamente, se carga bajo demanda el codificador WebAssembly de `@jsquash/webp`. El decodificador privado del servidor no se incluye en el bundle del navegador.

La previsualización indica que aún no está guardada. Los Object URLs se revocan al descartar, sustituir o desmontar. El cierre de sesión cancela solicitudes y descarta respuestas tardías. El archivo y la clave de reintento se conservan solo en memoria; tras recargar se consulta la foto confirmada, sin reproducir automáticamente una carga.

El Worker limita el cuerpo real a 1 MiB, comprueba RIFF/WEBP, estructura, dimensiones y un único frame, y decodifica con libwebp mediante WebAssembly. Rechaza animación, SVG, EXIF/XMP, chunks desconocidos y dimensiones distintas de 512 × 512. Admite el perfil ICC acotado que Canvas incorpora a su exportación. La extensión y el Content-Type por sí solos nunca validan la imagen.

## API

| Ruta                        | Contrato                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `PUT /api/me/avatar`        | Cuerpo binario `image/webp`, `Idempotency-Key` UUID y `X-Profile-Version`. Solo modifica al usuario autenticado. |
| `DELETE /api/me/avatar`     | `X-Profile-Version`; quita la referencia propia y programa limpieza. La interfaz pide confirmar.                 |
| `GET /api/users/:id/avatar` | Foto vigente para usuarios autenticados; avatar predeterminado si no existe. No acepta claves R2 arbitrarias.    |

Las mutaciones exigen cookie, mismo origen y límite por cuenta (8/minuto, clave separada de login). Las respuestas de perfil se validan en el cliente. `409` distingue conflicto de versión/idempotencia y carga pendiente; no se repiten escrituras automáticamente. Reintentar conserva bytes, clave y versión. Consultar el perfil permite descartar el intento y comenzar otro. Si la respuesta se pierde después del commit, la misma clave recupera la operación; nunca vuelve a adjuntar una foto ya sustituida. La interfaz confirma la solicitud y muestra la foto **vigente**, que puede haber cambiado en otro dispositivo.

La foto se sirve con `Cache-Control: private, no-cache`, `Vary: Cookie`, ETag y `nosniff`. La sesión se valida antes incluso de responder 304. El perfil cambia la URL de visualización con su versión para reflejar cambios. Un objeto temporalmente no disponible devuelve 503; no se interpreta como eliminación de la referencia. No se utiliza caché pública ni un service worker para fotos privadas.

## Persistencia y recuperación

Producción usa `pokeswap-classroom-avatars`; pruebas usa `pokeswap-classroom-avatars-test`. Ambos tienen acceso r2.dev deshabilitado y no se configuran dominios públicos. Los objetos tienen claves aleatorias `avatars/<uuid>.webp`, sin nombre original ni ID SENATI.

1. Insertar `avatar_uploads` con propietario, hash SHA-256, clave idempotente, versión esperada y estado `pending`.
2. Solo el ganador de la inserción escribe en R2. Un reintento recupera el objeto si existe; no duplica un PUT en curso. Sin objeto confirmado devuelve `UPLOAD_PENDING`.
3. Marcar `stored` después del PUT. Un lote D1 comprueba propietario/versión, programa limpieza de la foto anterior, actualiza referencia/versión y marca `committed`. Una aserción transaccional revierte el lote si la precondición no se cumple.
4. Un conflicto deja la foto vigente y programa limpieza del intento fallido. Un fallo de D1 después de R2 conserva la operación para recuperar el commit. Eliminar primero quita la referencia y registra limpieza en el mismo lote.

D1 y R2 no forman una transacción compartida. No se borran objetos antes de desacoplar la referencia. Operaciones `failed` y operaciones `committed` ya sustituidas nunca se reactivan desde la API.

## Limpieza programada

El handler `scheduled` corre cada 15 minutos en producción. Cada ejecución procesa hasta 50 cargas abandonadas de más de una hora y 50 trabajos vencidos. Los trabajos usan un lease de cinco minutos, registran intentos y reprograman fallos de borrado; las lecturas de referencias y cargas activas preceden a cualquier DELETE.

También recorre 100 objetos por ejecución, con cursor persistido en `media_sweep_state`. Esto encuentra escrituras R2 tardías que llegan después de una limpieza o interrupción. Solo considera objetos de más de una hora, sin referencia y sin carga activa. Completar un recorrido reinicia el cursor. El plazo total de limpieza depende del volumen y de la disponibilidad de D1/R2, no es una garantía de 15 minutos para todos los objetos.

La migración `0003_hard_runaways.sql` añade únicamente la tabla de cursor. Los registros de operaciones se conservan para idempotencia; las imágenes sustituidas o eliminadas se limpian. El test Worker no configura cron permanente y se elimina tras las comprobaciones.

## Validación

```sh
npm run check
npm run test:ui
npm run db:migrate:local
npm run db:migrate:test
env -u NODE_OPTIONS -u DEBUG npm run smoke:avatar:ui -- https://pokeswap-avatar-ui-xxxxxxxx.christian-ar-valo-jes-s.workers.dev
```

Vitest ejecuta decodificación WebP, sesiones, D1 y R2 locales, incluyendo dos cargas simultáneas, reintentos, fallos R2/D1, borrados fallidos, objetos vigentes y escrituras tardías. Playwright comprueba recorte, 512 px, límites, reintento idéntico, conflicto, eliminación, cierre durante carga y diseño adaptable en Chromium/WebKit. El script HTTPS crea exclusivamente un alumno ficticio en el host temporal de pruebas, comprueba otra sesión y elimina la referencia de foto al terminar. No captura fotos personales ni imprime credenciales.

En producción se comprueba acceso, formulario y avatar predeterminado sin cargar una foto en una cuenta real. La validación en teléfonos físicos y la entrega integral siguen en #20.

Referencias: [react-easy-crop](https://github.com/ValentinH/react-easy-crop), [jSquash](https://github.com/jamsinclair/jSquash), [contenedor WebP](https://developers.google.com/speed/webp/docs/riff_container), [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
