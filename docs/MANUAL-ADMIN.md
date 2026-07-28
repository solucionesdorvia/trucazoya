# Manual del administrador

Panel en **/admin** (sólo rol `ADMIN`). Toda acción sensible queda en el
`AuditLog`.

## Secciones

### Métricas
Usuarios, partidas, salas activas, asientos del ledger y retiros pendientes.

### Auditar usuario
Buscás por usuario, email o id y ves su saldo + una **auditoría del ledger**:
recorre la cadena de asientos y confirma que `después = antes + monto` y que el
ledger cuadra con la billetera (disponible + bloqueado). Si algo no cierra, lo
marca en rojo.

### Verificaciones de identidad (KYC)
Cola de KYC pendientes. Por cada envío ves nombre, tipo y número de documento y
—si el operador habilitó storage— el link al documento. **Aprobar** habilita los
retiros de ese jugador; **Rechazar** lo deja pendiente de reenvío. Ambas quedan
auditadas y notifican al jugador.

### Reconciliación de cajeros
Por cada cajero, el **contador de su perfil** vs. la **suma real del ledger**
(cargas y pagos), más el movimiento de las últimas 24 h. Si una fila dice **"No
cuadra"**, hay que investigar: la cifra del ledger es la verdad.

### Crear torneo
Alta de torneos (modo, cupo, entrada, premio).

### Reportes y sanciones
Resolución de reportes de jugadores y suspensión de cuentas.

### Últimas acciones registradas
Feed del `AuditLog`: quién hizo qué y cuándo.

## Configuración operativa (sin redeploy)

Se guarda en la tabla `SystemSetting`:

- `jurisdiction` → `{ "bloqueadas": ["SF", ...] }`: provincias donde no se puede
  registrar.
- `responsibleGaming` → `{ "defaultDailyDepositMax": 50000 }`: tope de carga
  diaria para quien no fijó el suyo.

## Alta de cajeros

Un cajero es un usuario con rol `CASHIER` y un `CashierProfile` (WhatsApp,
nombre visible, límites `perOpMax`/`perDayMax`). Se crea desde la base o con un
script de alta; conviene que los cajeros de **retiro** sean gente de máxima
confianza (manejan los pagos).

## Seguridad operativa

- Rotá las contraseñas de `admin` y `cajero1` antes de abrir al público
  (`SEED_ADMIN_PASSWORD` / `SEED_CASHIER_PASSWORD` + re-seed).
- `GAME_TOKEN_SECRET` debe ser un secreto fuerte y **el mismo** en web y
  game-server.
