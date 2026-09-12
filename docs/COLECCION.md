# Colección y progreso

Implementado en #10. `/coleccion` es exclusiva de alumnos autenticados; `/pokedex` mantiene el catálogo público. No se añaden dependencias ni migraciones.

## Lectura y reglas

`GET /api/me/collection` toma el propietario de la sesión, nunca de parámetros del navegador. Devuelve `Cache-Control: no-store`, ID de cuenta, filas agrupadas por especie con `total`, `protected`, `reserved`, `available`, y resumen con `goal: 150`, `obtained`, totales y `nextRefreshAt`. No expone datos personales, identificadores de ejemplares ajenos ni premios internos.

Una consulta SQL agrega el inventario y las reservas sobre la misma lectura de D1. Cinco Pikachu son cinco ejemplares, una especie y cuatro disponibles sin reservas. Cada especie tiene un ejemplar protegido: los triggers existentes rechazan reservarlo, transferirlo, desprotegerlo o eliminarlo. Las nuevas adquisiciones deben seguir esas restricciones.

Una reserva cuenta cuando pertenece al propietario, sigue vigente y su intercambio está abierto o pendiente y no ha vencido. En pendiente se usa la fecha de la propuesta. Al cerrar o vencer deja de descontar disponibilidad aunque aún exista su fila. Esta consulta no elimina reservas ni modifica intercambios: #13–#14 deben liberar filas vencidas y verificar propiedad, protección y disponibilidad dentro de la escritura atómica antes de reutilizar ejemplares. Un número disponible en pantalla nunca autoriza por sí solo una transferencia.

La meta y futura puntuación cuentan especies únicas #001–#150. Mew #151 se muestra obtenido o pendiente como adicional; sus duplicados sí aumentan cantidades y disponibilidad, pero no el denominador, progreso ni puntuación. El ranking continúa en #16.

## Interfaz y actualización

La colección ofrece búsqueda por nombre/número, filtros de obtenidas, repetidos, pendientes, todas y Mew; fichas con cantidades protegidas/reservadas/disponibles; progreso accesible y estados de carga, vacío y error. El inicial permanece como entrega histórica confirmada. El catálogo público no revela posesiones privadas.

TanStack Query utiliza la clave `['private', 'collection', userId]`, sin almacenamiento persistente y con descarte al desmontar. Se consulta al montar/volver, recuperar conexión o visibilidad, mediante el botón de actualización y al vencer la próxima reserva. No hay sondeo continuo. Ante error se ocultan los conteos anteriores; durante una comprobación se identifican como pendientes de actualización. Un 401 o identidad distinta retira la sesión de la interfaz; cancelar/cerrar sesión impide que respuestas antiguas restauren la colección.

`refreshCollection(queryClient)` invalida las lecturas locales y envía `collection-changed` por BroadcastChannel, sin datos privados. Los futuros servicios de canje/intercambio deben llamarlo después de confirmar una operación en el servidor. La otra pestaña invalida su lectura. Los canjes de #11 ya usan esta invalidación; los intercambios la integrarán en #15.

El contrato Zod compartido rechaza especies duplicadas, progreso o denominador inválidos y cantidades inconsistentes. El backend entrega el cálculo confirmado; la interfaz obtiene nombres e imágenes del catálogo local.

## Validación

- D1 real en Workers: cinco Pikachu, Mew repetido y meta completa, reservas abiertas/pendientes, vencimiento exacto y cierre sin limpieza, protección del primero, colección vacía, aislamiento de cuentas, permisos y contrato.
- Playwright: cantidades/fichas, filtros y búsqueda, anchos 320/390/768/1440, cambio de visibilidad, retorno, notificación entre pestañas, vencimiento, errores, identidad inesperada y respuesta tardía después del cierre.
- La comprobación móvil usa Chromium y WebKit con vistas emuladas; no sustituye la prueba en teléfonos físicos de #20.
- HTTPS real contra D1 de pruebas: registro ficticio, inicial y conteos persistidos, dos sesiones independientes móvil/escritorio, recarga y denegación anónima. Reproducible con `npm run smoke:collection:ui -- https://pokeswap-collection-ui-XXXXXXXX.christian-ar-valo-jes-s.workers.dev chromium` (o `webkit`); el script rechaza producción y requiere un Worker temporal conectado exclusivamente a recursos de pruebas.

Esta entrega no implementa transferencias, ranking o su autorización. Los PokéDrops se incorporaron en #11. Esas tareas siguen sus dependencias en Projects.
