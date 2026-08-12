# Trucazo — Dossier técnico y de cumplimiento

Plataforma web para jugar **Truco Argentino** en línea con economía de monedas
virtuales, pensada para ser operada por un tercero con **licencia de juego**.
Este documento es el paquete de handoff: qué es, cómo está construido, qué
controles de cumplimiento trae y qué falta para operar con dinero real.

---

## 1. Resumen ejecutivo

- **Producto:** Truco 1v1 y 2v2 en tiempo real, salas privadas/públicas,
  matchmaking, apuestas con monedas, torneos, ranking (Glicko-2), bots, tienda
  de cosméticos y panel de administración.
- **Economía sin pasarela:** las monedas se cargan y retiran por **cajeros**
  (usuarios con rol especial) coordinados por WhatsApp. Todo movimiento queda en
  un **libro contable append-only auditable**.
- **Juego demostrablemente justo:** el reparto usa **commit-reveal**; cualquiera
  puede verificar que no hubo manipulación.
- **Estado:** en producción (Railway), con las cinco áreas de cumplimiento
  implementadas (ver §4). Tests automatizados en verde.

---

## 2. Arquitectura

Monorepo pnpm + Turborepo, TypeScript estricto de punta a punta.

```
apps/web          Next.js 15 (App Router): UI, auth, wallet, admin, cajero, KYC
apps/game-server  Fastify + Socket.IO: partidas en vivo, matchmaking, presencia
packages/engine   Motor de Truco PURO (sin IO): reglas, estados, bots, barajado
packages/economia ledger, apuestas, cajeros, juego responsable, KYC, ranking
packages/shared   tipos, schemas Zod, contratos de eventos, tokens HMAC
packages/db       Prisma schema + cliente + migraciones + seed
```

**Principios de diseño**

- **El servidor es la única fuente de verdad.** El cliente sólo envía
  intenciones; nunca recibe información oculta. La vista de cada jugador se
  proyecta con `redactStateFor(seat)`: recibe _sus_ cartas y sólo la _cantidad_
  de cartas de los rivales.
- **Motor determinista y puro:** `applyAction(state, action) → {state, events}`.
  No hay aleatoriedad adentro (el mazo entra ya barajado). Esto habilita tests,
  replays y un simulador de miles de partidas.
- **Ledger append-only:** el saldo nunca se edita a mano; toda operación es una
  transacción con clave de idempotencia, saldo anterior/posterior y bloqueo de
  fila. Invariante: `ledger == disponible + bloqueado`.

---

## 3. Juego justo (fair play)

El reparto es verificable con un esquema **commit-reveal**:

1. Antes de cada mano, el servidor genera una semilla secreta y publica su
   **compromiso** `commit = SHA-256(semilla)`.
2. Al terminar la partida, **revela la semilla**.
3. Con la semilla, cualquiera recomputa el mazo (misma función Fisher–Yates
   sembrada por HMAC-SHA256) y comprueba que coincide con el que se jugó.

Verificación pública: **`/reparto/<matchId>`** (link directo desde la pantalla
de fin de partida). El barajado en producción usa CSPRNG; el esquema es
certificable por un auditor externo.

> Garantía estructural adicional: el motor jamás envía cartas ajenas y los bots
> sólo leen su propia mano. Hay un test que falla si una vista filtra la mano de
> otro jugador.

---

## 4. Cumplimiento regulatorio

| Área                      | Qué hace                                                                                                         | Dónde                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **+18**                   | Fecha de nacimiento obligatoria (validada en servidor); edad verificada exigida para retirar                     | Registro, `birthdateSchema`       |
| **KYC**                   | Verificación de identidad documental; cola de revisión del admin; retirar exige KYC aprobado                     | `/kyc`, `/admin`, `KycSubmission` |
| **Juego responsable**     | Límites de carga (día/semana) y de pérdida diaria + autoexclusión temporal/permanente, aplicados por el servidor | `/juego-responsable`              |
| **Jurisdicción**          | Provincia obligatoria; el operador bloquea provincias donde no tiene habilitación                                | `SystemSetting 'jurisdiction'`    |
| **Términos y privacidad** | Aceptación obligatoria en el alta; documentos base                                                               | `/terminos`, `/privacidad`        |
| **Antifraude cajeros**    | Reconciliación contador-vs-ledger; auditoría de cada operación; límites por cajero                               | `/admin` → Reconciliación         |
| **Trazabilidad**          | Toda acción sensible (admin, cajero, KYC, autoexclusión) queda en `AuditLog`                                     | —                                 |

Configuración operable sin redeploy (vía `SystemSetting`):
`jurisdiction.bloqueadas` (provincias) y `responsibleGaming.defaultDailyDepositMax`
(tope de carga por defecto).

---

## 5. Sistema de cajeros

Reemplaza a la pasarela de pagos. El jugador arregla por WhatsApp y el cajero
acredita/paga desde su panel.

- **Carga:** el cajero acredita → asiento `CASHIER_DEPOSIT` + auditoría +
  notificación. Respeta límites del cajero y del jugador (juego responsable).
- **Retiro:** el jugador lo solicita (el monto se **bloquea**); el cajero paga
  por fuera y lo marca **pagado** (`CASHIER_WITHDRAWAL`) o lo **rechaza** (libera
  el bloqueo). Retirar exige email + edad + KYC verificados y no estar
  autoexcluido.
- **Control:** `/admin` cruza el contador de cada cajero contra la suma real del
  ledger y marca lo que **no cuadra**.

Ver `docs/MANUAL-CAJERO.md` y `docs/MANUAL-ADMIN.md`.

---

## 6. Seguridad

- Contraseñas con **scrypt** + sal; sólo se guarda el hash. Sesiones por cookie
  httpOnly (se guarda el hash del token, no el token).
- Handshake del socket con **token HMAC** de vida corta (`GAME_TOKEN_SECRET`,
  mismo valor en web y game-server).
- Autorización siempre en el servidor (rol nunca confiado al cliente).
- Ledger con idempotencia + bloqueo de fila (evita doble liquidación y saldos
  negativos), probado con tests de concurrencia.

---

## 7. Operación y despliegue

- **Producción:** Railway — web + game-server + PostgreSQL administrado.
- **Migraciones:** `prisma migrate deploy` corre en el arranque de la web.
- **Observabilidad:** `/salud` y `/metricas` en el game-server (uptime, salas,
  sockets, cola de matchmaking, contadores, memoria).
- **Escala:** adapter de Redis para Socket.IO (activo con `REDIS_URL`).
  _Limitación conocida:_ el estado de cada partida vive en el nodo que la
  arrancó; para multi-nodo pleno hace falta afinidad por sala o mover el estado
  a Redis. El adapter ya resuelve el fan-out de eventos.
- **Prueba de carga:** `apps/game-server/scripts/carga.mts`.

Ver `DEPLOY.md`.

---

## 8. Qué falta para operar con licencia (a cargo del operador)

1. **Revisión legal** de términos y política de privacidad (son base) y del
   modelo de operación con dinero real en la jurisdicción elegida.
2. **Certificación externa del RNG** (el commit-reveal ya deja el reparto
   auditable para el certificador).
3. **Storage de documentos KYC** (hoy `docImageUrl` es una referencia; enchufar
   S3/R2 con acceso restringido) y, si aplica, verificación documental
   automática.
4. **Integración con financiera/medios de pago** habilitados y su conciliación.
5. **Rotar credenciales**: definir contraseñas de `admin`/`cajero1` por variable
   de entorno (`SEED_ADMIN_PASSWORD`, `SEED_CASHIER_PASSWORD`) y re-seedear.
6. **Límites por defecto y provincias bloqueadas** según la habilitación.

---

## 9. Verificación / calidad

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde.
- Motor: simulador de +1000 partidas sin invariantes rotos.
- Economía: tests de ledger, apuestas, cajeros, juego responsable, KYC y
  jurisdicción contra Postgres real.
- Tiempo real: partida completa 1v1 por sockets (sin fuga de cartas) y
  matchmaking end-to-end a través del adapter de Redis.
