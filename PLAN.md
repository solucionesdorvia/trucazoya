# Plan — Trucazo: Plataforma de Truco Argentino Online

## Contexto

Construir desde cero una plataforma web completa y profesional para jugar Truco Argentino online: partidas en tiempo real 1v1 y 2v2, salas privadas/públicas, matchmaking, apuestas con monedas virtuales, torneos, rankings, bots, sistema social, panel admin y deploy a producción.

**Cambios clave respecto del prompt maestro** (decisiones del usuario):

- **Sin pasarela de pagos.** La carga de monedas se hace vía **cajeros**: usuarios con rol especial que acreditan/debitan monedas manualmente. El contacto usuario↔cajero es por **WhatsApp** (links `wa.me`).
- Los cajeros procesan **cargas y retiros** (el jugador solicita retiro, el cajero lo aprueba y paga por fuera de la plataforma).
- Alcance: **plataforma completa** (todas las fases del prompt maestro), no solo un MVP.
- Nombre/marca: **Trucazo** → carpeta `/Users/valentindoroszuk/proyectos/trucazo`.

> ⚠️ **Nota legal (documentar en el repo):** si las monedas se compran/canjean por dinero real a través de cajeros, el sistema opera de hecho como juego por dinero real, que en Argentina está regulado a nivel provincial (Lotería/IPLyC según jurisdicción). La plataforma se modela como economía de monedas virtuales con ledger auditable, límites y herramientas de juego responsable; el cumplimiento regulatorio de la operación con dinero real es responsabilidad del operador. Esto queda escrito en el README y en los términos.

## Stack elegido

Reutiliza patrones ya probados en proyectos del usuario (branded-docs, superplataforma): Postgres en Docker con puerto custom, Prisma v6, auth con scrypt, deploy en Railway.

| Capa         | Tecnología                                                                         | Por qué                                                                     |
| ------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Monorepo     | pnpm workspaces + Turborepo                                                        | Motor/tipos compartidos entre web y game server                             |
| Lenguaje     | TypeScript estricto en todo                                                        | Tipado de punta a punta, contratos de eventos tipados                       |
| Frontend     | Next.js 15 (App Router) + Tailwind                                                 | SSR para landing/perfiles/rankings, mobile-first, ecosistema estable        |
| Tiempo real  | Node + Fastify + **Socket.IO**                                                     | Rooms nativas, reconexión con buffer, adapter Redis para escalar horizontal |
| DB           | PostgreSQL 16 (Docker local, puerto **54341**) + Prisma v6                         | Transacciones para ledger, patrón ya conocido                               |
| Cache/escala | Redis (adapter Socket.IO, presencia, colas de matchmaking)                         | Se introduce en Fase 6; antes, single-node en memoria + snapshots en PG     |
| Auth         | Sesiones con cookie httpOnly + scrypt; JWT corto firmado para handshake del socket | Patrón ya usado; sin dependencia de terceros                                |
| Validación   | Zod (compartido en `packages/shared`)                                              | Mismo schema valida cliente y servidor                                      |
| Tests        | Vitest (unit/integración) + Playwright (E2E, dos browsers)                         | Simulador de miles de partidas contra el motor                              |
| Deploy       | Railway (web + game-server + PG + Redis como servicios)                            | Ya lo usa el usuario; entornos dev/staging/prod                             |

## Arquitectura

```
apps/web          → Next.js: UI, REST (auth, perfiles, salas, wallet, admin, torneos)
apps/game-server  → Fastify + Socket.IO: partidas en vivo, matchmaking, presencia, chat
packages/engine   → Motor de truco PURO (sin IO): reglas, máquina de estados, bots, shuffle
packages/shared   → Tipos, schemas Zod, contratos de eventos, constantes
packages/db       → Prisma schema + client + migraciones + seeds
```

**Principios innegociables:**

- **Servidor = única fuente de verdad.** El cliente solo envía intenciones (`action.requested`) y renderiza estado confirmado. Nunca recibe cartas ajenas: el game server proyecta una **vista por jugador** (`redactStateFor(playerId)`).
- **Motor determinista y puro:** `applyAction(state, action) → { state', events }`. Sin `Math.random` dentro: el mazo se baraja con `crypto` (Fisher–Yates + `crypto.randomInt`) fuera del motor y entra como input. Esto habilita tests, replays y el simulador.
- **Partida en memoria + event log en PG:** cada acción validada se persiste (`GameEvent` con número de secuencia); snapshots periódicos (`MatchSnapshot`) para reconexión y recuperación ante caída del nodo.
- **Ledger append-only:** el saldo nunca se edita directo; toda operación es una transacción Prisma serializable con idempotency key, saldo anterior/posterior, y verificación de invariantes (sin negativos).

## Máquina de estados (motor)

`WAITING_FOR_PLAYERS → READY_CHECK → STARTING → DEALING → PLAYER_TURN ⇄ WAITING_FOR_BID_RESPONSE (envido/flor/truco encadenados) → RESOLVING_TRICK → ROUND_FINISHED → (DEALING | MATCH_FINISHED)` + ramas `PLAYER_DISCONNECTED / WAITING_FOR_RECONNECTION / MATCH_PAUSED / MATCH_CANCELLED`.

Cada transición: valida estado + jugador + legalidad de la acción, registra evento con secuencia, actualiza atómico, emite solo lo visible por cada cliente, es idempotente ante duplicados (dedup por `actionId`).

Reglas completas: jerarquía de 40 cartas, mano/pie, bazas y pardas (todas las combinaciones), envido/real envido/falta envido encadenados, flor/contraflor/contraflor al resto (configurable), truco/retruco/vale cuatro con quién puede recantar, son buenas, mazo, puntaje a 15/30, buenas y malas, 1v1 y 2v2 (orden de turnos, envido lo responde el pie, puntaje por equipo).

## Sistema de cajeros (reemplaza pasarela de pagos)

**Roles:** `USER`, `CASHIER`, `MODERATOR`, `ADMIN` (tabla de roles/permisos).

**Flujo de carga:**

1. Usuario toca "Cargar monedas" → ve lista de cajeros online/disponibles con botón WhatsApp (`wa.me/<tel>?text=` prellenado con su username y código de usuario).
2. Acuerdan por WhatsApp (fuera de la plataforma). El cajero, desde su **panel de cajero**, busca al usuario por username/código y acredita el monto → transacción `CASHIER_DEPOSIT` en el ledger con idempotency key, referencia y nota.
3. El usuario recibe notificación in-app y ve el movimiento en su billetera.

**Flujo de retiro:**

1. Usuario crea una **solicitud de retiro** (monto, cajero elegido). El monto se **reserva** (bloqueado, no apostable).
2. El cajero ve la cola de solicitudes en su panel, contacta por WhatsApp, paga por fuera, y marca la solicitud como **pagada** → transacción `CASHIER_WITHDRAWAL`. Puede rechazarla → se libera la reserva.
3. Estados del ticket: `PENDING → RESERVED → PAID | REJECTED | CANCELLED_BY_USER`.

**Controles:** cada cajero tiene límites configurables (por operación/día), balance de cajero auditado (cuánto acreditó/retiró), toda operación queda en `AuditLog`, alertas por patrones sospechosos (cargas circulares, transferencia entre cuentas vía apuestas arregladas), y el admin puede suspender cajeros. Retiros exigen cuenta verificada por email + antigüedad/actividad mínima configurable.

## Modelo de datos (resumen)

Entidades principales (Prisma, con índices, enums, timestamps, optimistic locking donde aplica):

- **Cuentas:** `User, Profile, Session, Role, Sanction, AuditLog`
- **Social:** `Friendship, Block, Club, ClubMember, Notification, Report`
- **Juego:** `Room, RoomParticipant, Match, MatchPlayer, GameEvent (event log secuenciado), MatchSnapshot, MatchResult, MatchChatMessage, MatchmakingTicket`
- **Ranking:** `Rating (Glicko-2 por modo), RatingHistory, Season, LeaderboardEntry`
- **Economía:** `Wallet, LedgerEntry (append-only, idempotency key, balanceBefore/After), Bet, BetParticipant, WithdrawalRequest, CashierProfile (tel WhatsApp, límites, disponibilidad)`
- **Torneos:** `Tournament, TournamentParticipant, TournamentMatch, TournamentPrize`
- **Progresión:** `Achievement, UserAchievement, Mission, UserMission, Cosmetic, UserCosmetic`
- **Plataforma:** `FeatureFlag, SystemSetting`

Tipos de transacción del ledger: `CASHIER_DEPOSIT, CASHIER_WITHDRAWAL, BET_RESERVED, BET_WON, BET_LOST, BET_REFUND, RAKE (comisión), DAILY_BONUS, LEVEL_REWARD, TOURNAMENT_ENTRY, TOURNAMENT_PRIZE, ADMIN_ADJUSTMENT, PENALTY`.

## Contratos de eventos (Socket.IO, tipados en shared)

`room.*` (created/joined/updated/left), `player.ready`, `match.started`, `cards.dealt` (solo cartas propias), `action.requested/accepted/rejected`, `card.played`, `bid.called/responded`, `trick.resolved`, `round.finished`, `match.finished`, `player.disconnected/reconnected`, `bet.reserved/settled`, `chat.message`, `spectator.joined`. Todos con número de secuencia por partida; el cliente que detecta hueco pide `match.sync` (snapshot redactado + eventos faltantes).

## Fases de implementación

Al cerrar cada fase: format + lint + typecheck + tests + build en verde, documentar lo hecho.

**Fase 1 — Fundaciones** _(repo + infra)_
Monorepo pnpm/turbo, `packages/shared`, `packages/db` (schema completo + migración inicial + seeds), Docker compose PG :54341, ESLint/Prettier/Vitest config, CI básico.

**Fase 2 — Auth, usuarios y diseño base**
Registro/login/verificación email/recuperación (scrypt + sesiones), cuenta invitado → conversión, perfiles, roles, layout mobile-first con identidad Trucazo (modo claro/oscuro), pantallas base.

**Fase 3 — Motor de Truco completo** _(la fase más crítica)_
`packages/engine`: cartas, jerarquía, máquina de estados, envido/flor/truco completos, pardas, 1v1 y 2v2, config de reglas (flor on/off, 15/30, tiempos). **Tests unitarios exhaustivos** (jerarquía, envido, todas las pardas, cadenas de cantos) + **simulador de 10.000+ partidas con acciones aleatorias legales** verificando invariantes (sin estados imposibles, puntajes válidos, siempre termina).

**Fase 4 — Salas y lobby**
Crear sala con toda la configuración (modo, puntos, privada/pública, contraseña, código, link, QR, apuesta, espectadores, flor, tiempos), navegador de salas, validaciones de ingreso, lobby con ready-check, expulsión, transferencia de anfitrión, chat previo.

**Fase 5 — Tiempo real: mesa jugable**
`apps/game-server`: Socket.IO con auth por token, vista redactada por jugador, mesa completa (cartas, cantos contextuales, cronómetro, historial de cantos, confirmación para mazo/abandono), reconexión con snapshot+replay de eventos, políticas de desconexión (gracia, pérdida automática, reembolso), sesión única por usuario, animaciones y sonidos.

**Fase 6 — Resultados, historial, ranking y matchmaking**
Persistencia de resultados, historial y replays (ocultando info secreta hasta cuando fue visible), Glicko-2 con divisiones (Bronce→Gran Maestro), temporadas, leaderboards (global/semanal/amigos), matchmaking con expansión progresiva de criterios (rating, apuesta, región, anti-rematch), Redis entra acá (colas + adapter Socket.IO + presencia).

**Fase 7 — Economía: wallet, ledger, apuestas y cajeros**
Wallet + ledger append-only, flujo de apuesta (confirmación de todos → reserva → partida → liquidación atómica con comisión configurable → auditoría), reembolsos por cancelación/desconexión, límites diarios/por partida, **sistema de cajeros completo** (rol, panel, cargas, solicitudes de retiro, links WhatsApp, límites, alertas antifraude), bonus diario y recompensas.

**Fase 8 — Bots, torneos, espectadores y social**
Bots con 5 niveles (heurística + probabilidad de cartas restantes + EV de cantos + bluff controlado; misma interfaz que un jugador humano, sin acceso a cartas ocultas), modo espectador con estado redactado, torneos (eliminación simple/doble, grupos, check-in, llaves, premios vía ledger, ausencias/descalificaciones), amigos/bloqueos/desafíos directos, clubes con roles y torneos internos.

**Fase 9 — Progresión y cosméticos**
Niveles/XP, misiones diarias/semanales, logros, rachas, tienda con monedas (solo cosméticos, nada pay-to-win: mazos, reversos, tapetes, marcos, títulos), inventario, eventos de temporada.

**Fase 10 — Admin, moderación y seguridad avanzada**
Panel admin con todas las secciones (usuarios, partidas, ledger, cajeros, torneos, reportes, sanciones, feature flags, métricas, salud), toda acción admin auditada, flujo de reportes con evidencia y sanciones progresivas, detección de colusión/multicuentas/transferencias artificiales (partidas repetidas entre mismas cuentas con apuestas), rate limiting global, hardening (CSRF, XSS, replay, race conditions en liquidaciones — probado con tests de concurrencia).

**Fase 11 — Observabilidad, E2E, carga y deploy**
Logs estructurados con correlation IDs, métricas (partidas activas, latencia, tiempos de matchmaking, fallos de liquidación), health/readiness checks, suite E2E Playwright (dos browsers jugando una partida completa con apuesta, desconexión/reconexión, cajero acreditando), prueba de carga básica de sockets, deploy a Railway (web + game-server + PG + Redis, staging y prod), backups, documentación final (README, arquitectura, reglas, manual de admin y de cajero, guía de deploy).

## Riesgos técnicos y mitigación

1. **Corrección del motor (pardas, cadenas de cantos, 2v2)** → motor puro + simulador masivo + tests por caso enumerado. Es la razón de que la Fase 3 sea previa a todo lo online.
2. **Doble liquidación / race conditions en apuestas** → ledger con idempotency keys, transacciones serializables, tests de concurrencia dedicados (doble clic, dos liquidaciones simultáneas, caída durante liquidación).
3. **Estado en memoria vs. caída del nodo** → event log + snapshots en PG; recuperación de partida al reiniciar; documentado como límite conocido hasta multi-nodo con Redis.
4. **Fraude vía cajeros (colusión, lavado de monedas entre cuentas)** → límites, alertas por patrones, auditoría total, retiros solo con cuenta verificada.
5. **Alcance enorme** → orden de fases estricto: al final de la Fase 7 ya hay producto completo jugable con economía real de cajeros; 8–9 son expansión, 10–11 endurecen y despliegan.

## Verificación

- **Por fase:** `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde antes de avanzar.
- **Motor:** simulador de 10.000+ partidas sin invariantes rotas.
- **E2E clave (criterio de aceptación del prompt):** dos usuarios reales se registran → crean sala → comparten código → apuestan → juegan partida completa con envido/truco → uno se reconecta a mitad de partida → se liquida la apuesta → ven movimientos en billetera → revancha. Más: cajero acredita monedas, usuario solicita retiro y cajero lo marca pagado, admin audita el ledger.
- **Manual:** preview con dos browsers (normal + incógnito) jugando en vivo contra el dev server.
