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
- Los sorteos son independientes, uniformes y permiten repetidos. El docente puede crear más PokéDrops para seguir entregando ejemplares.
- Registro más primer PokéDrop dejan al alumno con **cuatro ejemplares**, que pueden ser de especies iguales o diferentes.
- Los repetidos se acumulan: `Pikachu ×5` representa cinco ejemplares individuales, no cinco especies diferentes.
- Se protege un ejemplar por especie y solo se intercambian los sobrantes. Cinco Pikachu permiten ofrecer cuatro, si no hay reservas activas.
- Los intercambios son uno por uno, requieren propuesta y aceptación, y transfieren ambos ejemplares o ninguno.
- El ranking cuenta especies únicas; los alumnos con la misma cantidad comparten posición.
- Mew #151 queda fuera de esta versión y de todos sus sorteos.

No se fuerzan duplicados: si un alumno recibe cuatro especies diferentes, puede seguir coleccionando mediante PokéDrops hasta obtener ejemplares adicionales de alguna especie. No se garantiza completar los 150 durante una clase.

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

1. Registro, inicio/cierre de sesión y cuenta docente.
2. Inicial aleatorio, catálogo de 150 especies, colección agrupada y Pokédex.
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
Cloudflare D1 — datos persistentes

PokéAPI — fuente inicial del catálogo y las imágenes
```

El backend controla sorteos, propiedad, protección, reservas y permisos. PokéAPI aporta información descriptiva; no se consulta para decidir o confirmar cada premio.

Cada ejemplar tiene identidad propia. El historial conserva su origen y cambios de propietario. Registro, canjes e intercambios deben ser atómicos y seguros ante reintentos y solicitudes simultáneas.

La autenticación usa código de estudiante y contraseña, con sesión en cookie segura. La cuenta docente se provisiona fuera del registro público. El MVP funciona con una sola clase.

La PWA cachea su shell, pero las consultas actualizadas y todas las operaciones del juego requieren conexión. No se encolan intercambios ni canjes offline.

## Orden de implementación

1. Crear proyecto, Worker, D1 y despliegue mínimo.
2. Preparar migraciones y catálogo #001–#150.
3. Implementar autenticación y entrega inicial única.
4. Implementar colección, Pokédex y duplicados.
5. Implementar PokéDrops para obtener tres ejemplares adicionales.
6. Implementar intercambio completo y verificar concurrencia.
7. Completar ranking, administración, PWA y verificación móvil.

El objetivo es entregar este flujo funcional durante la jornada. La integridad de canjes e intercambios forma parte del MVP; el acabado visual puede simplificarse para priorizarlo.

## Validación mínima de entrega

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

Este README concentra la documentación vigente del proyecto: reglas, alcance del MVP y criterios mínimos de aceptación.

Todavía no existen comandos de instalación, desarrollo, migración ni despliegue disponibles en este repositorio local. Se documentarán aquí cuando estén implementados y verificados. No se deben incluir credenciales ni secretos en Git.
