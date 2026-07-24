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

## Deploy en Railway (paso a paso)

El repo tiene **dos apps** (`web` y `game-server`) que se despliegan como **dos servicios**
separados desde el **mismo repo**, más los plugins de **PostgreSQL** y **Redis**.

### 1. Base de datos y cache

En el proyecto de Railway: **New → Database → PostgreSQL**. Repetí con **Redis** (opcional por
ahora, hace falta recién para multi-nodo).

### 2. Servicio `web`

**New → GitHub Repo →** este repo. Luego en **Settings** del servicio:

- **Root Directory:** dejar la raíz del repo (es un monorepo pnpm).
- **Build Command:** `pnpm install --frozen-lockfile && pnpm --filter @trucazo/web build`
  _(el cliente Prisma se genera solo por el `postinstall` de la raíz)_
- **Start Command:** `pnpm --filter @trucazo/db exec prisma migrate deploy && pnpm --filter @trucazo/web start`
  _(las migraciones corren acá, una sola vez, antes de arrancar la web)_
- **Variables:** `DATABASE_URL` (referenciá la del plugin Postgres), `SESSION_SECRET`,
  `GAME_TOKEN_SECRET`, `WEB_URL` (la URL pública de este servicio),
  `NEXT_PUBLIC_GAME_SERVER_URL` (la URL pública del game-server), `NODE_ENV=production`.

### 3. Servicio `game-server`

**New → GitHub Repo →** el mismo repo, como **segundo servicio**. En **Settings**:

- **Root Directory:** la raíz del repo.
- **Build Command:** `pnpm install --frozen-lockfile`
- **Start Command:** `pnpm --filter @trucazo/game-server start`
- **Networking:** exponé un dominio público (el browser se conecta directo por WebSocket).
- **Variables:** `DATABASE_URL` (la misma del Postgres), `GAME_TOKEN_SECRET`
  (**el mismo valor que en `web`** — con eso se firman y verifican los tokens del socket),
  `WEB_URL` (URL pública de la web, para CORS), `NODE_ENV=production`.

### 4. Datos de arranque (una vez)

Para tener las cuentas demo, corré el seed una sola vez (desde tu máquina apuntando a la
`DATABASE_URL` de producción, o con `railway run`):

```bash
pnpm --filter @trucazo/db seed
```

> ⚠️ El seed crea cuentas con contraseña conocida (`trucazo123`). Está bien para un entorno de
> prueba; **no lo corras en un entorno real** o cambiá las contraseñas después.

### Resumen de comandos (si deployás a mano o en otro proveedor)

```bash
pnpm install --frozen-lockfile      # genera el cliente Prisma por postinstall
pnpm --filter @trucazo/db exec prisma migrate deploy
pnpm --filter @trucazo/web build
# arranque:
pnpm --filter @trucazo/web start          # servicio web
pnpm --filter @trucazo/game-server start  # servicio game-server
```

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
