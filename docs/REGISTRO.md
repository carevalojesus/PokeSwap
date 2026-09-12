# Registro atómico del alumno

La tarea #4 implementa el servicio `createRegistrationService(DB)` en `src/server/registration/register.ts`. Su función `register(input)` guarda cuenta, alias, inicial e historial y devuelve únicamente el ID interno, el alias y los identificadores del inicial confirmado.

La capa de dominio y persistencia de #4 está conectada al adaptador HTTP, sesiones, login/logout y recuperación autenticada implementados en #5; ver [autenticación](AUTENTICACION.md). El formulario está conectado en #7 mediante React Hook Form/Zod. La validación común vive en `src/shared/schemas/registration.ts` y el adaptador HTTP usa `src/shared/schemas/auth.ts`; el dominio vuelve a validar antes de persistir. Ver [acceso desde la interfaz](ACCESO.md). La foto opcional se incorporará mediante el flujo de medios de #9, después de confirmar la cuenta.

## Validación y normalización

Se admiten exclusivamente `senatiId`, `firstNames`, `lastNames`, `birthDate` y `password`, todos como texto. Campos como rol, alias, propietario o especie elegida se rechazan.

- ID: NFC, espacios exteriores recortados, mayúsculas y entre 1 y 32 caracteres Unicode. Conserva ceros y separadores; rechaza espacios internos, controles y caracteres de formato invisibles. No verifica matrícula institucional.
- Nombres y apellidos: NFC, espacios normalizados, de 1 a 100 caracteres y sin controles ni caracteres de formato. Conserva tildes y nombres compuestos. Pueden repetirse entre cuentas.
- Nacimiento: calendario `YYYY-MM-DD`, con validación de días y años bisiestos gregorianos; no admite fechas futuras según el día de `America/Lima`. No almacena edad ni usa la fecha para el premio.
- Contraseña: de 15 a 128 caracteres Unicode, sin controles ni sustitutos Unicode aislados, máximo 1024 bytes UTF-8. Conserva exactamente espacios y Unicode: no se recorta, normaliza ni trunca. La longitud mínima sigue el criterio para autenticación sin MFA de [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

El servicio limita el trabajo de normalización. El adaptador HTTP de #5 limita el cuerpo antes de leer JSON y aplica protección de origen/CSRF, errores públicos controlados y límites de intentos.

## Contraseñas compatibles con Workers

Se utiliza `node:crypto.scrypt`, disponible con `nodejs_compat`. El perfil es `N=16384`, `r=8`, `p=5`, sal aleatoria de 16 bytes y clave derivada de 32 bytes. Consume aproximadamente 16 MiB para el trabajo de scrypt, con `maxmem` de 32 MiB. Es uno de los perfiles de scrypt indicados por [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html); el soporte nativo está documentado por [Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).

El formato persistido es `scrypt$v1$16384$8$5$<sal hexadecimal>$<clave hexadecimal>`. `verifyPassword()` admite solo este perfil conocido y usa `timingSafeEqual`; un hash malformado no puede ordenar un coste arbitrario. La contraseña en claro no sale del servicio ni se guarda en D1. No se añadieron bibliotecas criptográficas ni hashes alternativos de menor coste.

Validación: hash/verificación reales en Vitest sobre Workers, sales distintas para una misma contraseña y un vector independiente de Python/OpenSSL. También se verificó hash y contraseña en una sesión temporal remota de Wrangler sin bindings ni datos del proyecto. Esta prueba de compatibilidad no sustituye la medición de capacidad con alumnos simultáneos de #20 ni los límites de acceso de #5.

## Alias persistente

`generateTrainerName()` combina dos sílabas curadas, un epíteto y cuatro caracteres aleatorios legibles. Usa la selección uniforme ya implementada; no recibe ID, nombres, fecha de nacimiento ni otros datos personales. El generador tiene versión `1` y guarda nombre y clave normalizada NFKC/minúsculas/espacios junto a la cuenta.

La unicidad la impone `users_trainer_key_unique`. Ante una colisión se reintenta hasta cinco candidatos. Se reutilizan el mismo hash, IDs y resultado del sorteo durante esos intentos: una colisión no ofrece otra oportunidad de obtener una especie rara. Agotar los intentos produce `TrainerNameUnavailable` sin escrituras parciales.

## Lote y recuperación

Antes de calcular el hash se comprueba si el ID existe para evitar trabajo innecesario. Esta consulta no garantiza unicidad: la restricción de D1 decide la carrera entre solicitudes.

El único `DB.batch()` contiene, en orden:

1. Cuenta de rol `student`, con identidad normalizada, contraseña derivada y alias.
2. Premio `initial`, un sorteo, versión de probabilidades y beneficiario.
3. Ejemplar de posición `0`, protegido, versión `0` y especie decidida por `drawPokemon()`.
4. Evento `issued` con referencias al premio, ejemplar y propietario.

Son inserciones obligatorias: cada sentencia inserta una fila o falla. No hay `OR IGNORE`, `ON CONFLICT DO NOTHING` ni actualizaciones de cero filas que pudieran confirmar un lote incompleto. Un fallo en cualquiera de ellas revierte todo el lote. No se usan transacciones interactivas del ORM.

Un registro repetido, incluso con la contraseña correcta, devuelve `RegistrationConflict` y no entrega el perfil ni el inicial existente. No reemplaza contraseña, nombres, alias ni colección. Si se pierde una respuesta confirmada, el login de #5 autentica al alumno y consulta sus resultados persistidos; no ejecutar otro registro para recuperarlos. Los errores de almacenamiento inesperados se propagan para que el adaptador los traduzca sin exponer SQL ni detalles privados.

## Pruebas

Las pruebas cubren campos inesperados, ceros y separadores, tildes, controles, límites, calendario y cambio de día en Lima; alias determinista y clave normalizada; scrypt y verificación; registro completo; dos solicitudes forzadas a competir tras la consulta inicial; conflictos sin recuperación; colisiones de alias acotadas; fallo del hash; especie inexistente; y fallo de la última escritura de historial, comprobando la reversión de cuentas, premios y ejemplares.

Ejecutar `npm run check`. No se requieren migraciones nuevas: el servicio utiliza las restricciones de #2 y el catálogo de #3. Los datos ficticios de las pruebas se guardan únicamente en D1 temporal.
