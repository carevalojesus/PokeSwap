# Perfil editable y edad

La tarea #8 conecta la edición de nombres, apellidos y fecha de nacimiento en `/perfil`. Está disponible para la cuenta autenticada, sea alumno o docente. El ID SENATI, alias, rol, foto y credenciales no forman parte del contrato de edición. La foto corresponde a #9; la administración de alumnos a #16.

## Contrato y persistencia

`PATCH /api/me/profile` recibe JSON con `firstNames`, `lastNames`, `birthDate` y `profileVersion` (entero no negativo, versión leída del perfil). Devuelve el perfil autenticado actual con edad calculada y nueva versión. Requiere cookie vigente, mismo origen y Content-Type JSON; el lector compartido limita el cuerpo real a 8 KiB.

`src/shared/schemas/profile.ts` aplica Zod estricto tanto en el formulario como en el servidor. Reutiliza las reglas de nombres y fecha del registro: NFC, espacios normalizados, entre 1 y 100 caracteres por nombre/apellido, sin caracteres de control y calendario gregoriano válido no posterior al día actual de Lima. El servidor rechaza campos adicionales, incluidas identidades ajenas o campos protegidos.

Una única sentencia `UPDATE ... WHERE id = <usuario autenticado> AND profile_version = <versión esperada> RETURNING ...` guarda los tres campos e incrementa la versión. La comprobación y escritura son atómicas en D1; dos envíos con la misma versión producen un guardado y un `409 PROFILE_CONFLICT`. No hay migraciones nuevas.

`GET /api/me` conserva la lectura propia; `GET /api/admin/users/:id` conserva la consulta privada autorizada al docente. No se añade una ruta pública de datos personales ni edición administrativa de cuentas ajenas.

## Conflictos y solicitudes inciertas

El formulario mantiene un borrador en memoria con la versión con la que se abrió. No cambia silenciosamente esa versión cuando una lectura en segundo plano recibe un perfil más reciente. Durante una comprobación pendiente o fallida de sesión, el borrador permanece montado pero oculto; una sesión invalidada, un cambio de cuenta o el cierre lo elimina.

- Un `409` conserva el borrador y bloquea un nuevo guardado hasta consultar el perfil actual.
- Si se pierde la respuesta, se advierte que el cambio podría haberse guardado. No se reintenta automáticamente el PATCH ni se anuncia éxito.
- «Cargar datos actuales» informa que reemplazará el borrador; solo lo reemplaza cuando la lectura responde correctamente. El usuario revisa los datos antes de otro guardado.
- El éxito exige una respuesta validada con la versión esperada incrementada y los valores enviados. Si otro cambio ya ocurrió antes de recuperar el perfil, se pide revisar el resultado.
- Cerrar sesión cancela solicitudes de perfil y descarta respuestas tardías. La caché comprueba que la cuenta siga siendo la misma antes de aceptar un resultado.
- El aviso `profile-changed` entre pestañas no contiene datos personales y provoca una lectura, manteniendo la versión original de los formularios abiertos. Login/logout conservan su invalidación completa.

El borrador no se persiste en localStorage. Cancelar la edición o abandonar la ruta lo descarta.

## Edad y cambio de día

La base guarda nacimiento, nunca una edad fija. `getPrivateProfile` calcula los años cumplidos con el calendario `America/Lima`. Un nacimiento del 29 de febrero cumple años el 1 de marzo en años no bisiestos. Nombres y nacimiento no modifican alias, premios ni probabilidades.

La consulta se refresca al entrar, recuperar visibilidad/conexión, vencer la sesión y llegar a medianoche en Lima. El temporizador se rearma tras cada respuesta, aunque los datos no hayan cambiado. Los equipos suspendidos recuperan el perfil al volver; no se calcula una edad alternativa con el reloj del cliente. El reloj local solo programa la próxima lectura.

## Verificación

```sh
npm run check
npm run test:ui
env -u NODE_OPTIONS -u DEBUG npm run smoke:profile:ui -- https://pokeswap-profile-ui-xxxxxxxx.christian-ar-valo-jes-s.workers.dev /ruta/credenciales-de-pruebas.json
```

Las pruebas Workers cubren cumpleaños, cambio de año, febrero bisiesto/no bisiesto, ambos lados de medianoche de Lima, validación, campos protegidos, permisos, persistencia y dos PATCH concurrentes sobre D1.

Playwright comprueba edición, conflicto, respuesta perdida, lectura de recuperación fallida, borrador conservado durante una comprobación de sesión, doble envío, logout durante el guardado y dos medianoches consecutivas. Usa Chromium y WebKit, con anchos de 320 a 1440 px. La prueba de calendario usa el [reloj controlado de Playwright](https://playwright.dev/docs/clock).

El script de integración admite exclusivamente el host temporal de perfil y credenciales marcadas `--test`. Comprueba dos sesiones reales de navegador contra D1 de pruebas, restaura los campos originales y cierra ambas sesiones; la versión sigue aumentando. No crea capturas, trazas ni registros de credenciales. El Worker temporal se elimina después. En producción se verifica lectura y acceso docente sin editar datos personales como prueba. La comprobación con teléfonos físicos continúa en #20.
