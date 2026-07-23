# Deploy de Trucazo

## Arquitectura de servicios

Trucazo se despliega como **cuatro servicios**:

| Servicio      | Qué es                      | Escala                                     |
| ------------- | --------------------------- | ------------------------------------------ |
| `web`         | Next.js (UI + REST + admin) | Horizontal sin estado                      |
| `game-server` | Fastify + Socket.IO         | Ver "Escalado" abajo                       |
| `postgres`    | Base de datos               | Vertical + réplicas de lectura             |
| `redis`       | Colas / presencia / pub-sub | Necesario recién al escalar el game-server |

Se eligió **Railway** por costo inicial bajo, soporte de WebSockets y despliegue desde el repo. Nada del código depende del proveedor: son procesos Node estándar con variables de entorno, así que mudarlo a Fly.io, Render o un VPS con Docker es cambiar el runner, no el código.

## Variables de entorno

Copiar `.env.example` y completar. **Las críticas:**

| Variable                      | Notas                                                                    |
| ----------------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`                | Postgres. En Railway lo inyecta el plugin.                               |
| `SESSION_SECRET`              | ≥32 bytes aleatorios. **Distinto por entorno.**                          |
| `GAME_TOKEN_SECRET`           | ≥32 bytes, **distinto de `SESSION_SECRET`**. Firma los tokens de socket. |
| `WEB_URL`                     | Origen de la web. El game-server lo usa para CORS.                       |
| `NEXT_PUBLIC_GAME_SERVER_URL` | URL pública del game-server (la usa el browser).                         |
| `PLATFORM_RAKE_BPS`           | Comisión en basis points (500 = 5%).                                     |
| `FEATURE_REAL_MONEY`          | Dejar en `false`. Ver la nota legal del README.                          |

Generar secretos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Pasos

```bash
pnpm install --frozen-lockfile
pnpm --filter @trucazo/db generate
pnpm --filter @trucazo/db migrate:deploy
pnpm --filter @trucazo/web build
```

Arranque: `pnpm --filter @trucazo/web start` y `pnpm --filter @trucazo/game-server start`.

## Health checks

- Game server: `GET /salud` → `{ ok, salas, uptime }`.
- Web: `GET /` (200).

Configurar el healthcheck del proveedor contra `/salud` del game-server: si un nodo se cae, hay partidas en curso ahí.

## Escalado

**El game-server hoy es de un solo nodo.** El estado vivo de las partidas está en memoria (con event log y snapshots en Postgres para recuperación). Para correr varias instancias hace falta:

1. Adapter de Redis en Socket.IO (`@socket.io/redis-adapter`) para que los eventos crucen nodos.
2. Afinidad de sala → nodo (sticky por `code`), o mover el estado de la mesa a Redis.

Hasta entonces: **escalar el game-server verticalmente y la web horizontalmente**. Está documentado como límite conocido, no como algo terminado.

## Backups

- Postgres: backup diario automático + retención de 7 días como mínimo.
- **El ledger es la fuente de verdad contable.** Antes de cualquier migración que lo toque, backup y verificación con `auditarUsuario`.
- Restaurar: `pg_restore` + `prisma migrate deploy`.

## Rollback

Los servicios no guardan estado en disco. Rollback = volver al deploy anterior. Cuidado con las migraciones: las que borran columnas no son reversibles solas — hacerlas en dos pasos (agregar → migrar datos → borrar en un release posterior).

## Entornos

`development` (local con docker-compose) · `staging` (base propia, datos de prueba) · `production`.

Nunca compartir `DATABASE_URL` ni secretos entre entornos.

## Checklist antes de producción

- [ ] Secretos generados y distintos por entorno
- [ ] Migraciones aplicadas (`migrate:deploy`, no `migrate dev`)
- [ ] Backups automáticos configurados y **restauración probada**
- [ ] `FEATURE_REAL_MONEY=false`
- [ ] Cajeros dados de alta con sus límites (`perOpMax`, `perDayMax`)
- [ ] Términos y política de privacidad publicados
- [ ] Revisar la nota legal del README con un abogado si se canjean monedas por dinero
