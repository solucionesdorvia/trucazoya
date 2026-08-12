# Qué falta para salir al mercado

Auditoría de producción y de cumplimiento previa al lanzamiento (agosto 2026).
Todo lo que sigue está verificado contra el código, con archivo y línea.

> Este documento **no es asesoramiento legal**. Las referencias normativas hay
> que confirmarlas con un abogado de juego en la jurisdicción que se elija.

---

## Resumen

**El producto está bien construido. El negocio, tal como está planteado, no se
puede lanzar.**

El núcleo técnico es sólido y en varios puntos mejor que el de competidores
con años en el mercado: ledger append-only con bloqueo de fila y tests de
concurrencia reales, servidor como única fuente de verdad, y un barajado
commit-reveal con verificador público que casi nadie tiene.

El bloqueante no es técnico: es que **cargar fichas con dinero real, apostarlas
y retirarlas es juego de azar por dinero real**, y eso en Argentina requiere
autorización provincial. Sin ella hay exposición penal (art. 301 bis CP, según
Ley 27.446), y la red de cajeros cobrando en cuentas personales por WhatsApp
agrega exposición por lavado, evasión y datos personales.

---

## 1. Bloqueantes legales

| #   | Bloqueante                                                                                                 | Estado hoy                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| L1  | **Sin licencia provincial** para operar juego por dinero real                                              | Reconocido en prosa (README, T&C), no implementado                              |
| L2  | **Cajeros = cash-in/cash-out no registrado** (AML, BCRA, fiscal)                                           | `packages/economia/src/cajeros.ts`; el sistema registra fichas, **nunca pesos** |
| L3  | **KYC simbólico**: la foto del documento es un campo de texto donde el usuario pega una URL, y es opcional | `FormKyc.tsx:51`                                                                |
| L4  | **Edad autodeclarada**: `ageVerifiedAt` se setea en el registro con la fecha que tipeó el usuario          | `cuentas.ts:69`                                                                 |
| L5  | **Límites aflojables al instante** (sin período de enfriamiento); `sessionMinutesMax` no se aplica         | `juego-responsable.ts:46`                                                       |
| L6  | **Datos de KYC** sin storage propio, sin retención, sin ARCO, sin AAIP                                     | `schema.prisma:301`                                                             |
| L7  | **T&C sin operador identificado** ni resolución de disputas; una cláusula probablemente abusiva            | `terminos/page.tsx`                                                             |
| L8  | **Fiscal: cero**. El rake del 5% no se factura ni se declara                                               | Sin una sola mención a ARCA/IIBB en el repo                                     |

### Los cuatro caminos

| Camino                                                      | Tiempo      | Veredicto                                                                                                                          |
| ----------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **A · Fichas sin canje** (social gaming)                    | 2-4 semanas | ✅ **Único lanzable ya.** Se elimina el canje por dinero; se monetiza con cosméticos, pase y suscripción. Conserva ~90% del código |
| **B · Vender la plataforma a un operador licenciado** (B2B) | 3-9 meses   | ✅ **El más realista para monetizar lo construido.** Requiere borrar el módulo de cajeros y certificar el RNG                      |
| **C · Licencia propia**                                     | 12-36 meses | ❌ Fuera de alcance: capital alto y licitaciones cerradas                                                                          |
| **D · Offshore apuntando a Argentina**                      | 4-8 semanas | ❌ No protege: si se organiza desde Argentina, la licencia extranjera no es defensa                                                |

**Recomendación: A ahora, B en paralelo.** A pone el producto en manos de
usuarios y valida la retención; B es donde el trabajo hecho vale dinero.

---

## 2. Bloqueantes técnicos

### Resueltos en esta pasada (commit `e0d07aa`)

- ✅ **`FEATURE_REAL_MONEY` era decorativo.** El README lo anunciaba como
  protección pero no se leía en ninguna línea: cargas y retiros funcionaban
  igual. Ahora corta de verdad.
- ✅ **Caída del proceso = plata congelada.** Sin `unhandledRejection`, un
  timeout de Postgres mataba el game-server; como el estado vive en memoria,
  cada caída dejaba apuestas `RESERVED` (debitadas de ambos, acreditadas a
  nadie).
- ✅ **Fuga de memoria.** `RegistroSalas.eliminar()` no lo llamaba nadie: el Map
  crecía hasta el OOM → reinicio → lo anterior.
- ✅ **La revancha nunca funcionó** (dos bugs encadenados).

### Pendientes, por orden

| #   | Bloqueante                                                                                                                                                                                     | Esfuerzo |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| T1  | **Sin recuperación de partidas.** Un reinicio con partidas en curso deja el `Match` IN_PROGRESS y la `Bet` RESERVED para siempre. Mínimo: barrido al arrancar que reembolse apuestas huérfanas | Medio    |
| T2  | **Sin job de reconciliación de apuestas colgadas** ni alerta. La plata se congela y nadie se entera                                                                                            | Medio    |
| T3  | **Sin timeout de turno.** `turnTimeoutSec` está en el schema y no se usa: un jugador puede congelar la apuesta del rival indefinidamente                                                       | Medio    |
| T4  | **Observabilidad nula.** Sin Sentry, sin logs estructurados, sin alertas. Si alguien pierde plata a las 3am, nadie se entera                                                                   | Medio    |
| T5  | **Sin rate limiting** en ningún punto: login sin lockout, `mm:buscar` hace query por evento                                                                                                    | Medio    |
| T6  | **Sin staging ni config de deploy versionada**; `/salud` no toca la base                                                                                                                       | Medio    |
| T7  | **Payloads de socket sin validar** con zod; sala privada sin chequear contraseña                                                                                                               | Chico    |
| T8  | **18 dependencias vulnerables**, sin `audit` en CI                                                                                                                                             | Chico    |
| T9  | **Transacción anidada en torneos**: se puede cobrar la entrada sin inscribir                                                                                                                   | Chico    |
| T10 | **Redis da falsa sensación de multi-nodo**: el estado sigue siendo per-node. Fijar réplicas=1                                                                                                  | Chico    |

---

## 3. Lo que ya está bien (no tocar)

- **Ledger**: append-only, `SELECT … FOR UPDATE`, idempotencia por clave única,
  invariante de saldo no negativo, comisión por partida doble contra
  `_plataforma`. Con tests de concurrencia reales contra Postgres.
- **Integridad del juego**: `redactStateFor` nunca manda cartas ajenas, con un
  test que falla si se filtra una mano.
- **Fairness**: commit-reveal + verificador público en `/reparto/[matchId]`. Es
  el mejor activo comercial para el camino B.
- **Auth y autorización**: scrypt, sesiones con hash, HMAC de socket con
  comparación en tiempo constante, autorización server-side, `AuditLog`.
- **Juego responsable**: enganchado de verdad a los flujos de plata, no
  decorativo.
- **CI** con Postgres real, 197 tests y simulador de 2000 partidas.

---

## 4. Plan sugerido

**Semanas 1-2 — Decidir el camino.** Es una decisión de negocio, no técnica, y
todo lo demás depende de ella. Una consulta con un abogado de juego cuesta
menos que una semana de desarrollo.

**Si es A (fichas sin canje):**

1. Quitar `/cajero`, retiros y `MANUAL-CAJERO.md`; cambiar "apuesta" por
   "entrada".
2. Resolver T1-T4 (el dinero deja de ser real, pero un reinicio que borra
   partidas sigue siendo mala experiencia).
3. Exponer la progresión que ya existe (XP, misiones, logros) y sumar el chat
   global del análisis de TrucoX.

**Si es B (B2B):**

1. Borrar el módulo de cajeros **antes** de mostrar el producto.
2. Resolver T1-T6 (un comité de compliance los va a pedir).
3. Presupuestar certificación de RNG con laboratorio (GLI/BMM/eCOGRA).
4. Armar el dossier con el verificador de fairness como pieza central.
