# Sesiones, permisos y cuenta docente

La tarea #5 conecta el registro atómico con autenticación mediante ID SENATI y contraseña. Implementa rutas Hono, cookies opacas, sesiones persistidas en D1, controles de origen, permisos y provisión docente mediante CLI. La navegación y las pantallas de acceso están conectadas en #6/#7; ver [sesión en el cliente](ACCESO.md). La administración paginada completa corresponde a #16.

## Módulo y sesión

Se usa un módulo propio pequeño sobre Hono y su [helper de cookies](https://hono.dev/docs/helpers/cookie), D1 y el hash scrypt ya verificado en #4. No se incorpora un proveedor externo ni un esquema de autenticación basado en correo; la identidad de acceso sigue siendo SENATI. Los contratos de respuesta están en `src/shared/contracts/auth.ts`.

La cookie `__Host-pokeswap-session` tiene `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sin `Domain` y con duración absoluta de siete días. Contiene 32 bytes aleatorios codificados en hexadecimal. D1 conserva solo SHA-256 del token, usuario, creación, vencimiento y revocación. No se guarda ningún token en localStorage ni se devuelve en el JSON.

Cada solicitud protegida consulta D1 y comprueba expiración y revocación; también obtiene el rol actual de la cuenta. No hay renovación deslizante ni caché de permisos. Un login genera un token nuevo y revoca la sesión presentada en la misma transacción que crea la nueva. La inserción comprueba que el hash de contraseña verificado siga vigente; si cambió mientras se verificaba, se revierte el lote completo.

Logout revoca solo la sesión presentada y borra la cookie. Es idempotente, incluso sin cookie o con una sesión ya revocada. No queda bloqueado por los límites de intentos de login. Otras sesiones del mismo usuario, por ejemplo en otro teléfono, permanecen activas.

## Rutas disponibles

| Ruta                       | Resultado                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/register`  | Datos de registro de #4; crea cuenta e inicial, luego sesión. `201` con perfil propio e inicial persistido. |
| `POST /api/auth/login`     | `senatiId` y `password`; `200` con la misma cuenta e inicial y una nueva cookie.                            |
| `POST /api/auth/logout`    | JSON vacío `{}`; revoca la sesión actual y devuelve `204`.                                                  |
| `GET /api/auth/session`    | ID interno, rol y vencimiento de la sesión autenticada.                                                     |
| `GET /api/me`              | Perfil propio con edad calculada en Lima, referencia de avatar, inicial y vencimiento.                      |
| `GET /api/admin/users/:id` | Perfil privado de un usuario, solo para docente.                                                            |

Perfil e inicial se devuelven como `{ user, initial, session }` en registro/login/me; la consulta docente no incluye `session`. El docente no recibe un inicial al provisionarse, por lo que `initial` es `null`. Los campos de contraseña y sesión almacenada nunca entran en el DTO. `avatarUrl` es `null` cuando no hay foto; la carga y entrega real de fotos se incorpora en #9.

`requireSession` valida la sesión, `requireTeacher` exige rol docente y `requireSelfOrTeacher` comprueba propiedad para recursos privados parametrizados. Se aplican en ese orden; los espacios `/api/me` y `/api/admin` quedan protegidos como grupos para sus futuras rutas. `/api/me` obtiene el ID de la sesión; parámetros de consulta no permiten elegir otra persona. Las futuras mutaciones del juego deben incluir además propietario, versión y demás precondiciones en su SQL atómico.

Todas las respuestas usan `Cache-Control: no-store`. No se activa CORS para orígenes externos. Los hashes, tokens y datos personales no se registran en logs de aplicación.

## CSRF, entrada y límites

Toda mutación bajo `/api/*` exige `Origin` exactamente igual al origen real de la URL recibida; se rechazan origen ausente, `null`, otros dominios y subdominios. No se confía en `X-Forwarded-Host`. Cuando existe `Sec-Fetch-Site`, solo se admiten `same-origin` o `none`.

Las rutas de autenticación aceptan exclusivamente JSON. Se cuentan los bytes realmente leídos del stream y se rechaza un cuerpo mayor de 8 KiB, incluso si `Content-Length` falta o miente. Los campos admitidos se validan antes de calcular el hash. Las contraseñas se conservan sin recorte ni normalización.

El control de origen estricto, JSON y cookies SameSite protege las mutaciones sin un token CSRF adicional. Los clientes CLI deben enviar un `Origin` correcto; en el navegador, `fetch` lo proporciona para las mutaciones. Las lecturas GET no cambian estado.

Los bindings de [Rate Limiting de Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) limitan registro/login a ocho intentos por ID normalizado cada minuto y un techo de 120 por IP cada minuto. El techo de IP es mayor para permitir una clase tras la misma red. Las claves llevan prefijo y SHA-256; producción y pruebas usan namespaces separados.

Estos contadores son locales a cada ubicación de Cloudflare y eventualmente consistentes; no se presentan como un bloqueo global exacto. Los límites se deberán medir con el tamaño real de la clase en #20. Un rechazo devuelve `429`, `Retry-After: 60`; un binding fallido no permite saltarse el control.

## Errores y recuperación

- `400`: JSON o campos inválidos; `413`: cuerpo excesivo; `415`: tipo de contenido incorrecto.
- `401`: sesión ausente/vencida/revocada o credenciales incorrectas. ID inexistente y contraseña incorrecta usan el mismo mensaje y una derivación scrypt equivalente.
- `403`: origen o permiso no permitido.
- `409 ACCOUNT_EXISTS`: registro repetido; no revela ni reemplaza la cuenta. Se debe iniciar sesión.
- `503 SESSION_START_FAILED`: el registro confirmó, pero no pudo abrir sesión. Login recupera la cuenta y el mismo inicial.
- Otros fallos internos devuelven un mensaje controlado sin SQL ni detalles privados.

Registro y sesión se confirman en dos lotes intencionalmente separados, como establece README. Perder la respuesta o fallar al crear la sesión no vuelve a sortear. La verificación del inicial persistido está cubierta por pruebas de recuperación.

## Provisión docente fuera del registro público

La herramienta `npm run teacher:create` comparte validación, generador de alias y scrypt con el servidor. No existe endpoint público para crear/promover docentes y el registro público rechaza `role` u otros campos impuestos por el cliente.

Crear un JSON **privado y fuera de Git** con `senatiId`, `firstNames`, `lastNames` y `birthDate` (sin contraseña). Elegir explícitamente el destino:

```sh
npm run teacher:create -- --local --input .local/docente.json
npm run teacher:create -- --test --input .local/docente.json
npm run teacher:create -- --production --input .local/docente.json
```

El script genera una contraseña aleatoria de 32 caracteres, deriva su hash e inserta directamente una cuenta `teacher`, sin premio. Conserva ID único y falla ante conflicto: no promueve ni sobreescribe una cuenta existente. No sirve como herramienta de restablecimiento de contraseña.

Las credenciales se guardan bajo `.local/teacher-*/credentials.json`, en un directorio privado y archivo con permisos `0600`. La consola muestra solo esa ruta. El SQL temporal también es privado y se elimina al terminar. `.local/` está excluido de Git; no subir, compartir ni copiar esos archivos a una issue.

Si la ejecución no confirma éxito, el archivo queda con estado `pending`. Revisar la cuenta en D1 antes de reintentar: una respuesta perdida podría corresponder a una inserción confirmada. No generar cuentas o contraseñas nuevas a ciegas. El estado `created` identifica una ejecución confirmada.

## Validación

`npm run check` verifica cookies, hashes en D1, límites, origen, cuerpos inválidos, expiración exacta, revocación, rotación, independencia de sesiones por dispositivo, recuperación, credenciales obsoletas, permisos cruzados, rol actual y provisión sin promoción accidental.

```sh
npm run smoke -- https://tu-worker.workers.dev
npm run smoke:auth -- https://tu-worker.workers.dev .local/teacher-XXXXXX/credentials.json
```

La segunda prueba lee credenciales solo del archivo, comprueba login/perfil/permisos y cierra su propia sesión; no imprime contraseñas ni perfiles. `POKESWAP_SMOKE_ORIGIN` permite usar el origen interno correcto cuando se ejecuta a través del proxy local de `wrangler dev --remote`; no modifica la validación del servidor.

También se verificó el recorrido remoto con un docente y un alumno ficticios en D1 de pruebas: registro, conflicto, rechazo de acceso administrativo, recuperación del mismo inicial y revocación. Las cuentas ficticias quedan exclusivamente en la base de pruebas; la cuenta docente real se provisiona en producción. No se añaden migraciones en esta tarea.
