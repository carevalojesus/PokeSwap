# Organización del trabajo

El trabajo de PokeSwap Classroom se organiza en [GitHub Projects](https://github.com/users/carevalojesus/projects/6/views/2), con [issues del repositorio](https://github.com/carevalojesus/PokeSwap/issues) como unidades de implementación.

## Columnas

| Estado | Uso |
|---|---|
| Backlog | Trabajo pendiente de preparar o con dependencias pendientes. |
| Listo | Alcance y criterios claros, con dependencias resueltas. |
| En progreso | Implementación activa; máximo una issue por responsable. |
| En revisión | Cambio implementado, con validación registrada y listo para revisión. |
| Bloqueado | Impedimento concreto documentado en la issue, con siguiente acción para resolverlo. |
| Hecho | Criterios cumplidos, cambios integrados, validación registrada e issue cerrada. |

## Flujo de cada tarea

1. Consultar el tablero y las dependencias antes de comenzar. Reutilizar la issue correspondiente; crear una si aparece trabajo nuevo dentro del alcance autorizado.
2. Mover a Listo cuando sus dependencias estén resueltas. Al comenzar, asignar responsable y mover a En progreso.
3. Trabajar en una rama vinculada a la issue, por ejemplo `feat/1-base-proyecto`. Mantener el alcance de la tarea; registrar nuevos pendientes en issues separadas cuando corresponda.
4. Abrir una PR con la issue vinculada mediante `Closes #N`, explicar resultado y pruebas, y mover a En revisión. No integrar cambios solo por haber terminado de escribirlos.
5. Documentar un bloqueo real y mover a Bloqueado si impide continuar. Las dependencias todavía no iniciadas permanecen en Backlog.
6. Después de revisar, validar e integrar el cambio, cerrar la issue y mover a Hecho. Revisar si se habilitan tareas dependientes para moverlas a Listo.

Los cambios de Status son manuales mientras no se configuren y verifiquen automatizaciones. Cerrar una issue o integrar una PR no se debe asumir suficiente para actualizar el tablero: comprobar ambos estados.

## Prioridades y fases

| Prioridad | Criterio |
|---|---|
| P0 — Crítica | Base, integridad, persistencia y validación de entrega. |
| P1 — MVP | Funciones y experiencia necesarias para el alcance definido. |
| P2 — Acabado | Animaciones y audio; se simplifican antes de comprometer la integridad. |

Las fases son **Base funcional**, **Juego completo** y **Acabado y entrega**, según [ARQUITECTURA.md](ARQUITECTURA.md#fases-de-entrega). La prioridad no omite dependencias. Las fechas y estimaciones se fijarán con información real, sin dar por terminadas funciones que solo están documentadas.

## Definición de terminado

- Criterios de aceptación de la issue cumplidos.
- Pruebas apropiadas ejecutadas y resultados registrados en la PR.
- Reglas del [README](README.md) y decisiones de [arquitectura](ARQUITECTURA.md) respetadas o actualizadas explícitamente.
- Sin secretos en Git ni datos privados expuestos en interfaces públicas.
- Cambio revisado e integrado; issue cerrada y Status en Hecho.
- Para la entrega: flujo HTTPS con docente y alumnos, concurrencia y revisión móvil verificados.

La configuración inicial del tablero contiene tareas de implementación pendientes. Crear una issue, redactar arquitectura o añadir una casilla no constituye implementación ni validación.
