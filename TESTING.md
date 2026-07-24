# 🎴 Trucazo — Guía para probar

Gracias por probar Trucazo. Es una plataforma para jugar al **Truco Argentino** online.
Esta guía te lleva por todo lo que se puede probar, paso a paso. Tomate 15–20 minutos.

> **Importante:** las monedas son **virtuales**, para jugar dentro de la app. No es dinero real.

---

## Antes de empezar

- Entrá desde el **celular o la computadora**, con cualquier navegador moderno.
- Para probar una partida contra otra persona necesitás **dos sesiones**: podés usar dos
  dispositivos, o una ventana normal + una ventana de **incógnito** en la misma compu.
- Si algo no anda o se ve raro, **anotá qué hiciste justo antes** y sacá una captura. Eso es lo
  más útil para arreglarlo.

## Cuentas de prueba

Todas usan la contraseña **`trucazo123`**:

| Usuario   | Para qué sirve                                            |
| --------- | --------------------------------------------------------- |
| `pepe`    | Jugador normal (arranca con 500 monedas)                  |
| `juana`   | El rival de pepe                                          |
| `toto`    | Cuarto jugador, para probar 2 vs 2                        |
| `mica`    | Cuarto jugador, para probar 2 vs 2                        |
| `cajero1` | **Cajero**: carga monedas y paga retiros (panel especial) |
| `admin`   | **Administrador**: ve todo, audita y modera               |

También podés **crear tu propia cuenta** desde "Crear cuenta". Te regala 500 monedas de bienvenida.

---

## 1. Registro e ingreso

1. Entrá a la página principal y tocá **Crear cuenta**.
2. Poné un usuario, un email y una contraseña (mínimo 8 caracteres).
3. Deberías entrar directo al inicio, con tus 500 monedas arriba a la derecha.

**Qué mirar:** que los mensajes de error sean claros si ponés un usuario repetido o una
contraseña corta.

## 2. Jugar una partida contra otra persona (lo principal)

Necesitás dos sesiones (ver "Antes de empezar").

1. **Sesión A** (por ej. `pepe`): tocá **Crear sala** → elegí 1 vs 1, 30 puntos → **Crear**.
2. Vas a ver un **código de 6 letras**. Copialo.
3. **Sesión B** (por ej. `juana`): en el inicio, pegá el código en **Unirse con código**.
4. Los dos tocan **Estoy listo**. La partida arranca sola.
5. Jugá una mano:
   - Tocá una carta para tirarla (sólo se levantan las que podés jugar).
   - Cuando corresponda, van a aparecer botones para **Envido**, **Truco**, **Flor**, etc.
   - El rival ve **Quiero / No quiero**.
   - El marcador de arriba muestra "Nosotros" y "Ellos".

**Qué mirar:**

- Que **nunca veas las cartas del rival** (sólo las tuyas).
- Que los botones de canto aparezcan **sólo cuando se pueden usar**.
- Que el puntaje sume bien (envido = 2, truco querido = 2, etc.).
- Que la partida termine cuando alguien llega a 30 y muestre quién ganó.

## 3. Buscar rival automáticamente (sin código)

1. En las dos sesiones, tocá **Buscar partida** → elegí el mismo modo (ej. 1 vs 1 casual).
2. En unos segundos deberían quedar emparejados y entrar juntos a una sala.

**Qué mirar:** que el cronómetro de espera corra y que, al encontrar rival, los lleve a los dos a
la misma mesa.

## 4. Jugar contra la máquina (bots)

1. Tocá **Crear sala** → activá **Permitir bots** → **Crear**.
2. Tocá **Estoy listo**. Los lugares vacíos se completan con bots y la partida arranca.

**Qué mirar:** que el bot juegue solo y a un ritmo natural (no instantáneo).

## 5. Reconexión

En medio de una partida, **recargá la página** (F5) o cerrá y volvé a abrir la pestaña.

**Qué mirar:** que vuelvas a la misma partida, con tus cartas y el puntaje intactos.

## 6. Apostar monedas

1. Al **crear la sala**, poné un monto de apuesta (ej. 100).
2. Los dos jugadores necesitan tener ese saldo. Al terminar, el ganador se lleva el pozo
   (menos una pequeña comisión).

**Qué mirar:** que a los dos se les descuente al empezar y que el ganador cobre al terminar.
Después revisá **Billetera** → los movimientos quedan listados con el saldo después de cada uno.

## 7. Cargar y retirar monedas (cajeros)

Así funciona la plata en Trucazo: **no hay tarjetas ni pasarela**. Se arregla con un **cajero** por
WhatsApp.

**Cargar** (como jugador):

1. Entrá a **Billetera** → vas a ver la lista de cajeros con un botón de **WhatsApp**.
2. (En la prueba el número es de mentira, no escribas de verdad.) La carga te la hace el cajero
   desde su panel.

**Acreditar** (como cajero — entrá con `cajero1`):

1. Vas a ver el link **Cajero** arriba. Entrá al panel.
2. En **Cargar monedas**, poné el usuario (ej. `pepe`) y un monto → **Acreditar**.
3. Entrá de nuevo como `pepe` → la Billetera muestra la carga.

**Retirar** (como jugador):

1. En **Billetera**, más abajo, **Pedir un retiro** (elegí monto y cajero).
2. El monto te queda **bloqueado**.
3. Como `cajero1`, en el panel vas a ver el retiro pendiente → **Ya le pagué** o **Rechazar**.

**Qué mirar:** que los números cierren siempre (lo que se descuenta = lo que se acredita) y que un
retiro rechazado te devuelva el saldo.

> Ojo: para **retirar** hace falta el email verificado. Las cuentas de prueba ya están verificadas.
> Si creás una cuenta nueva, el link de verificación aparece en la consola del servidor (en la
> versión de prueba no se manda email real).

## 8. Ranking y perfil

- **Ranking**: se llena a medida que se juegan partidas **competitivas** (no las casuales).
- **Tu perfil** (tocá tu nombre arriba): nivel, XP, victorias, logros.

## 9. Tienda

- **Tienda**: comprá reversos de carta, tapetes, marcos y títulos con tus monedas. Después
  **equipalos**. Es sólo estético — nada te da ventaja en la mesa.

## 10. Amigos

- **Amigos**: agregá a alguien por su usuario, aceptá solicitudes.

## 11. Panel de administración (entrá con `admin`)

1. Tocá el link **Admin** arriba.
2. Vas a ver métricas, la lista de cajeros, y podés:
   - **Auditar un usuario**: buscás por nombre y te dice si su contabilidad "cierra".
   - **Crear un torneo**.
   - **Resolver reportes** y **suspender** cuentas.

---

## Cómo reportar lo que encuentres

Para cada cosa que veas mal, contame:

1. **Qué hiciste** (los pasos).
2. **Qué esperabas** que pasara.
3. **Qué pasó** en realidad.
4. Una **captura** si se puede, y **con qué usuario** estabas.

Todo suma: desde un texto que se corta, un botón que no hace nada, hasta algo que se rompe.
¡Gracias por probar! 🙌
