# 🎴 Trucazo

Plataforma web de **Truco Argentino online**: partidas en tiempo real (1v1 y 2v2), salas privadas con código, apuestas con monedas virtuales, ranking competitivo, bots y panel administrativo.

La carga y el retiro de monedas se hacen mediante **cajeros** — usuarios con rol especial que operan por **WhatsApp**. **Sin pasarela de pagos.**

> ⚠️ **Aviso legal.** Trucazo modela una economía de **monedas virtuales** con ledger auditable, límites y herramientas de juego responsable. Si un operador canjea esas monedas por dinero real vía cajeros, opera de hecho un juego por dinero real, regulado en Argentina a nivel provincial (Lotería / IPLyC según jurisdicción). El cumplimiento regulatorio es responsabilidad del operador. El circuito de dinero real (cargas y retiros por cajero) sólo funciona con `FEATURE_REAL_MONEY="true"`; con cualquier otro valor las cargas y retiros se rechazan. **Operar con dinero real requiere licencia provincial: ver `docs/LANZAMIENTO.md`.**

## Stack

pnpm workspaces + Turborepo · TypeScript estricto · Next.js 15 + Tailwind v4 · Fastify + Socket.IO · PostgreSQL 16 + Prisma v6 · Redis · Vitest · Railway.

## Estructura

```
apps/
  web/            → Next.js: UI, auth, salas, billetera, cajero, admin, ranking
  game-server/    → Socket.IO: partidas en vivo, salas, bots, reconexión
packages/
  engine/         → Motor de Truco PURO: reglas, máquina de estados, bots, simulador
  economia/       → Ledger append-only, apuestas, cajeros, Glicko-2
  shared/         → Tipos, schemas Zod, contratos de eventos, tokens
  db/             → Prisma schema, migraciones, seeds
```

## Puesta en marcha

Requisitos: Node ≥ 22, pnpm ≥ 10, Docker.

```bash
pnpm install
cp .env.example .env && cp .env.example packages/db/.env
cp .env.example apps/game-server/.env && cp .env.example apps/web/.env.local
pnpm db:up
pnpm db:generate && pnpm --filter @trucazo/db migrate && pnpm db:seed
```

Dos procesos:

```bash
pnpm --filter @trucazo/web dev
```

```bash
pnpm --filter @trucazo/game-server dev
```

Cuentas demo (password `trucazo123`): `admin` (ADMIN) · `cajero1` (CASHIER) · `pepe`/`juana`/`toto`/`mica`.

## Principios de arquitectura

1. **El servidor es la única fuente de verdad.** El cliente envía intenciones y renderiza estado confirmado. Nunca recibe cartas ajenas: el game-server proyecta `redactStateFor(seat)`. Los botones de canto salen de las acciones legales que calcula el motor **en el servidor**.
2. **Motor puro y determinista.** `applyAction(state, action) → { state, events }`. Sin IO ni aleatoriedad interna: el mazo barajado entra como input. Eso habilita tests, replays y el simulador.
3. **Ledger append-only.** El saldo nunca se edita a mano. Cada movimiento es una transacción con bloqueo de fila, idempotency key y saldo anterior/posterior. Invariante auditable: `ledger == disponible + bloqueado`.

## Verificación

```bash
pnpm -r test
```

**197 tests.** Además:

```bash
pnpm --filter @trucazo/engine sim 10000
```

30.000 partidas simuladas sin invariantes rotos, con victorias ~50/50 (sin sesgo de turnos).

Cobertura destacada:

- **Motor (46):** jerarquía de las 40 cartas, envido en todos sus casos, flor, todas las combinaciones de pardas, cadenas de cantos, fin de partida.
- **Economía (31):** concurrencia real — 10 débitos simultáneos, doble clic con idempotencia, dos liquidaciones en paralelo, saldo nunca negativo, auditoría de la cadena contable, Glicko-2.
- **Game server (10):** partida 1v1 completa jugada por **sockets reales** contra la base, suplantación de asiento rechazada, idempotencia de acciones, redacción verificada (auditamos todo lo que recibió cada cliente), bots.
- **Web (12):** registro/login contra Postgres, sin enumeración de cuentas, contraseñas nunca en claro.

## Estado del desarrollo

Ver [PLAN.md](PLAN.md) para el detalle de las 11 fases.

| Fase                                      | Estado                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Fundaciones (monorepo, DB, infra)     | ✅                                                                                                                                                 |
| 2 · Auth, perfiles, diseño base           | ✅                                                                                                                                                 |
| 3 · Motor de Truco + tests + simulador    | ✅                                                                                                                                                 |
| 4 · Salas, códigos, lobby                 | ✅                                                                                                                                                 |
| 5 · Tiempo real, mesa jugable, reconexión | ✅                                                                                                                                                 |
| 6 · Ranking Glicko-2 + divisiones         | ✅                                                                                                                                                 |
| 7 · Billetera, ledger, apuestas, cajeros  | ✅                                                                                                                                                 |
| 6 · Matchmaking automático                | ✅ cola por modo con ventana de rating que se abre con la espera                                                                                   |
| 8 · Torneos + amigos + reportes           | ✅ torneos de eliminación (inscripción/llaves/premio + creación desde admin), amigos, perfil público. Clubes y espectadores: pendientes            |
| 9 · Progresión + tienda                   | ✅ XP, niveles con recompensa, misión diaria, logros, **tienda de cosméticos** (comprar/equipar, cierra el ciclo de la economía)                   |
| 10 · Admin y moderación                   | ✅ panel con métricas, cajeros, auditoría de ledger, reportes, suspensión, ajuste de saldo, crear torneos                                          |
| 11 · Observabilidad, E2E, deploy          | 🟡 health checks, [DEPLOY.md](DEPLOY.md), **CI (GitHub Actions)**, E2E de sockets. Falta métricas/tracing, E2E Playwright de UI y pruebas de carga |

**Verificación de email** (token de un solo uso, sólo el hash en la base) — desbloquea los retiros, que la exigen.

**Pendiente conocido:** clubes, modo espectador, doble eliminación, métricas/tracing, E2E de UI con Playwright y multi-nodo con Redis.

## Documentación

- [PLAN.md](PLAN.md) — plan completo por fases
- [DEPLOY.md](DEPLOY.md) — deploy, escalado, backups, rollback
- [packages/engine/README.md](packages/engine/README.md) — reglas implementadas y API del motor

## Límites conocidos

- **El game-server corre en un solo nodo.** El estado vivo está en memoria (con event log en Postgres). Multi-nodo requiere el adapter de Redis — documentado en [DEPLOY.md](DEPLOY.md).
- El motor no modela el "envido primero" (interrumpir un truco pendiente con envido). No afecta el cálculo de tantos ni la resolución de bazas, que están cubiertos por tests.
