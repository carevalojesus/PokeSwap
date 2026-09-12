# Registro y sesión en la interfaz

La tarea #7 conecta los formularios React con la API Hono/D1 de #5. Las consultas usan TanStack Query y los formularios React Hook Form con Zod. El servidor sigue siendo la autoridad sobre identidad, permisos, perfil e inicial.

## Recorridos disponibles

- `/registro`: cuenta de alumno con ID SENATI, nombres, apellidos, nacimiento y contraseña. No envía rol, alias ni especie elegida por el cliente.
- `/ingresar`: acceso común de alumno y docente con ID y contraseña. El rol confirmado determina el destino: `/coleccion` o `/docente`.
- `/perfil`: consulta de los datos propios devueltos por la API, incluida la edad calculada en Lima. La edición con control de versión está implementada en #8; ver [perfil editable](PERFIL.md). La foto está implementada en #9; ver [fotos privadas](FOTOS.md).
- `/coleccion`: muestra exclusivamente la entrega inicial persistida del alumno. No calcula ni inventa progreso, duplicados o colección completa; esa función sigue en #10.
- `/docente/*`: exige rol docente antes de mostrar la estructura de #6. El panel completo y listado de alumnos siguen en #16.
- Ranking e intercambios requieren sesión y mantienen el mensaje de disponibilidad hasta implementar sus servicios.

Crear una cuenta o ingresar requiere respuesta válida del POST **y una consulta autenticada posterior** de `/api/me` que confirme el mismo usuario. Una respuesta 200 sin cookie utilizable no anuncia éxito. Recargar o volver a ingresar recupera el mismo inicial.

## Contratos y validación

`src/shared/schemas/registration.ts` contiene las reglas comunes de normalización y registro que antes vivían en el servidor. Se mantienen ceros iniciales, NFC en nombres/ID, calendario gregoriano y fecha máxima en Lima. La contraseña no se recorta ni normaliza.

`src/shared/schemas/auth.ts` expone los esquemas Zod de registro/login y de respuesta autenticada. El navegador usa el resolver de Zod; los endpoints vuelven a parsear con los mismos esquemas. El servicio de registro también valida antes de persistir. Login exige contraseña no vacía, sin imponer la longitud mínima de registro a una credencial existente. Objetos con campos extra se rechazan.

La respuesta se valida antes de guardarse en la caché. Se rechazan cuerpos incompletos, vencimientos ya pasados, campos adicionales y combinaciones inválidas de rol/inicial. Estos módulos compartidos no importan secretos, hashes ni código de base de datos.

## Sesión y caché

El token permanece en la cookie HttpOnly. Las solicitudes usan rutas del mismo origen, `credentials: same-origin`, `cache: no-store`, JSON y un plazo de 15 segundos. No se guardan tokens, contraseñas ni perfiles en localStorage/sessionStorage.

TanStack Query mantiene la consulta `['private', 'session']` solo en memoria. La obsolescencia es de 30 segundos, se consulta al montar, volver a la pestaña o reconectar, y un temporizador vuelve a comprobar el vencimiento absoluto y el cambio de día en Lima. No hay sondeo periódico de autenticación. Durante una comprobación pendiente o fallida se ocultan los datos privados; el usuario puede reintentar.

Las escrituras de registro/login/logout se ejecutan una vez por envío y no se reintentan automáticamente. Las credenciales no se introducen en la caché de mutaciones. Un bloqueo en memoria evita solicitudes simultáneas de autenticación desde la misma instancia de la aplicación.

Antes de cambiar de cuenta o cerrar sesión se cancelan las consultas y se vacía la caché. El fetch consume la señal de cancelación, de modo que una respuesta tardía no vuelve a poblarla. El botón de cierre permanece disponible si una comprobación de perfil está esperando o falla. Al completar login/logout, BroadcastChannel comunica únicamente `changed` a otras pestañas para que descarten su caché y consulten la sesión actual; no transmite datos personales ni credenciales. Donde no existe BroadcastChannel se conserva la comprobación al volver a la pestaña.

La protección de rutas del cliente mejora el recorrido; no reemplaza la autorización de cada API. Cambiar la URL o manipular el estado del navegador no concede permisos en D1/Hono.

## Errores y recuperación

| Situación                                      | Comportamiento                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Campo inválido                                 | Mensaje asociado al campo, `aria-invalid` y foco en el primer error.                                                                        |
| Credenciales incorrectas                       | Mensaje genérico; conserva el formulario para corregirlo.                                                                                   |
| ID existente o cuenta creada sin sesión        | Enlace a ingresar con la cuenta existente y recuperar el inicial.                                                                           |
| Respuesta de registro perdida                  | Advierte que la cuenta podría existir; propone login antes de repetir registro.                                                             |
| Límite de intentos                             | Muestra Retry-After y deshabilita el envío durante la espera; el servidor sigue imponiendo el límite.                                       |
| Cookie no confirmada                           | No muestra perfil ni éxito; pide permitir las cookies del sitio e ingresar nuevamente.                                                      |
| Lectura de sesión fallida o respuesta inválida | Oculta datos privados y ofrece volver a comprobar.                                                                                          |
| Logout fallido                                 | Borra datos locales y muestra «No pudimos confirmar el cierre» con reintento. La cookie podría seguir activa: no anuncia un cierre exitoso. |

El formulario permanece montado durante la sustitución de la caché para conservar mensajes y entradas tras un fallo. No muestra directamente mensajes arbitrarios del servidor. Al cambiar de ruta se elimina el formulario anterior, incluidas sus contraseñas en memoria.

## Verificación

```sh
npm run check
npm run test:ui
env -u NODE_OPTIONS -u DEBUG npm run smoke:auth:ui -- https://host /ruta/privada/credenciales.json
```

Las pruebas de Workers cubren validación compartida, registro, sesiones y permisos con D1. Los recorridos Playwright de UI usan respuestas controladas para comprobar fallos, doble envío, expiración, cancelación, cambio de cuenta, cookies no confirmadas y cierre entre pestañas en Chromium y WebKit, además de navegación y diseño adaptable.

El script `smoke:auth:ui` utiliza una cuenta docente ya provisionada y verifica formulario real, cookie, rol, perfil, cierre y rutas protegidas. No crea cuentas ni genera capturas/trazas; sanitiza fallos para no mostrar datos privados. Las pruebas completas de registro real se ejecutan en un Worker temporal HTTPS ligado únicamente a D1 de pruebas, con datos ficticios, y el Worker se elimina después. La cuenta docente real se comprueba en producción tras integrar y desplegar.

La revisión visual comprende móvil y escritorio. La emulación no sustituye las pruebas de teléfonos físicos y capacidad de la clase de #20. La recuperación automática de contraseña y los servicios del juego permanecen en sus respectivos alcances.

Referencias: [React Hook Form](https://github.com/react-hook-form/react-hook-form), [resolver Zod](https://github.com/react-hook-form/resolvers), [esquemas Zod](https://zod.dev/api) y [cancelación de consultas TanStack](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).
