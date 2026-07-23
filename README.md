# 🎴 Trucazo

Plataforma web de **Truco Argentino online**: partidas en tiempo real (1v1 y 2v2), salas privadas/públicas, matchmaking, apuestas con monedas virtuales, torneos, rankings, bots, sistema social y panel administrativo.

La carga y el retiro de monedas se hacen mediante **cajeros** (usuarios con rol especial) que operan por **WhatsApp** — **sin pasarela de pagos**.

> ⚠️ **Aviso legal.** Trucazo modela una economía de **monedas virtuales** con ledger auditable, límites y herramientas de juego responsable. Si un operador decide canjear esas monedas por dinero real vía cajeros, opera de hecho un juego por dinero real, regulado en Argentina a nivel provincial (Lotería / IPLyC según jurisdicción). El cumplimiento regulatorio es responsabilidad del operador. El dinero real está deshabilitado por diseño (`FEATURE_REAL_MONEY=false`).

## Stack

- **Monorepo:** pnpm workspaces + Turborepo · TypeScript estricto.
- **Frontend:** Next.js 15 (App Router) + Tailwind — mobile-first.
- **Tiempo real:** Fastify + Socket.IO (adapter Redis para escalar).
- **DB:** PostgreSQL 16 + Prisma v6. **Cache/colas:** Redis.
- **Auth:** sesiones cookie httpOnly + scrypt; JWT corto para el handshake del socket.
- **Tests:** Vitest (unit/integración) + Playwright (E2E). **Deploy:** Railway.

## Estructura

```
apps/
  web/           → Next.js: UI + REST (auth, perfiles, salas, wallet, admin)   [Fase 2+]
  game-server/   → Fastify + Socket.IO: partidas en vivo, matchmaking          [Fase 5+]
packages/
  engine/        → Motor de Truco PURO: reglas, máquina de estados, bots, sim   ✅
  shared/        → Tipos, schemas Zod, contratos de eventos                     ✅
  db/            → Prisma schema + client + migraciones + seeds                 ✅
```

## Puesta en marcha

Requisitos: Node ≥ 22, pnpm ≥ 10, Docker.

```bash
pnpm install
cp .env.example .env            # y en packages/db/.env
pnpm db:up                      # levanta Postgres (:54341) y Redis (:63791)
pnpm db:generate                # genera el cliente Prisma
pnpm --filter @trucazo/db migrate   # aplica migraciones
pnpm db:seed                    # datos de desarrollo
```

Cuentas demo (password `trucazo123`): `admin` (ADMIN), `cajero1` (CASHIER), `pepe`/`juana`/`toto`/`mica` (USER).

## Scripts útiles

```bash
pnpm test                       # tests de todos los paquetes
pnpm --filter @trucazo/engine sim 10000   # simula 10k partidas por escenario
pnpm typecheck
pnpm format
pnpm db:studio                  # Prisma Studio
```

## Principios de arquitectura

1. **El servidor es la única fuente de verdad.** El cliente sólo envía intenciones y renderiza estado confirmado. Nunca recibe cartas ajenas (ver `redactStateFor`).
2. **Motor puro y determinista.** `applyAction(state, action) → { state, events }`. Sin IO ni aleatoriedad interna: el mazo barajado entra como input. Esto habilita tests, replays y el simulador.
3. **Ledger append-only.** El saldo nunca se edita directo: cada movimiento es una transacción con idempotency key, saldo anterior/posterior y auditoría.

## Estado del desarrollo

Ver [PLAN.md](PLAN.md) para el detalle de las 11 fases.

- **Fase 1 — Fundaciones:** ✅ monorepo, Docker, Prisma (36 modelos), seeds.
- **Fase 3 — Motor de Truco:** ✅ reglas completas + 46 tests + simulador (30k partidas sin invariantes rotos).
- **Fase 2, 4–11:** pendientes.

## Reglas implementadas

Ver [packages/engine/README.md](packages/engine/README.md).
