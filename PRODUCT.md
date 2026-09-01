# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Jugadores argentinos de truco**, mayores de 18, jugando desde el celular. Vienen
a jugar plata contra otra persona, no contra la máquina. La mayoría llega por el
código de una sala que le pasó un conocido por WhatsApp.

**El operador (dueño de la plataforma)** carga y descuenta fichas, revisa que la
contabilidad cierre y resuelve los problemas que reporta un jugador.

**Cajeros**: cuentas con permiso para acreditar fichas a sus propios clientes,
arreglando el pago por fuera de la plataforma (WhatsApp).

## Product Purpose

Jugar truco argentino online por fichas, con las reglas de verdad (envido, real,
falta, flor, contraflor, truco, retruco, vale cuatro, pardas), en 1v1 y 2v2.

El éxito es que dos personas que no están en la misma mesa puedan jugarse plata
sin desconfiar: ni del reparto, ni del rival, ni de la cuenta.

## Positioning

Reparto verificable: antes de repartir se publica un sello del mazo y al terminar
cualquiera puede comprobarlo. Sumado a que el servidor es la única fuente de
verdad (nadie ve cartas ajenas ni puede forzar un resultado) y a que toda la
plata pasa por un ledger auditable.

## Operating Context

- **Sin pasarela de pagos.** Las fichas se cargan y se retiran por fuera de la
  plataforma: transferencia, Mercado Pago o efectivo, arreglado por WhatsApp.
  La plataforma registra el movimiento; el dinero se mueve afuera.
- **Dos caminos de carga que conviven**: el operador carga directo desde su
  panel, y los cajeros acreditan a sus propios clientes desde el suyo.
- **Cada carga lleva una nota escrita a mano** ("transferencia Pepe", "pago MP"),
  no campos estructurados de medio de pago ni comprobante.
- **El panel también descuenta**: cuando un jugador retira y ya se le pagó por
  fuera, y para corregir una carga mal hecha.
- Se juega en el celular, muchas veces con conexión inestable.

## Capabilities and Constraints

- Modos: 1v1 y 2v2, a 15 o 30 puntos, con o sin flor.
- Salas por código o link, públicas o privadas, y búsqueda automática de rival.
- Monto de fichas libre por mesa. Mínimo 2500 en 1v1 y 4000 en 2v2 para las
  partidas rápidas; las salas propias pueden ser sin fichas (jugar gratis).
- Comisión de la plataforma: 5% del pozo, a la cuenta `_plataforma`.
- **Ledger append-only**: el saldo nunca se edita directo. Todo movimiento tiene
  clave de idempotencia, saldo anterior y posterior, y la billetera se bloquea
  (`SELECT … FOR UPDATE`) para que no se pueda gastar dos veces lo mismo.
  Jugar no crea ni destruye fichas: sólo las mueve.
- La cuenta nueva arranca **sin fichas**: son plata real, no se regalan.
- Roles: `USER`, `CASHIER`, `MODERATOR`, `ADMIN`.
- **Torneos existen en el código pero no se pueden jugar** (el bracket no guarda
  quién juega contra quién y nada avanza las rondas). Están fuera de la
  navegación a propósito.

## Brand Commitments

- Nombre: **Trucazo**. Identidad "La Noche": mesa ovalada de paño en una
  habitación oscura, oro sobre negro.
- Se habla en argentino y en criollo del juego: "fichas", "mesa", "cantar",
  "irse al mazo". Nada de jerga técnica en pantalla.
- Nada de ilustración genérica ni stock: la mesa y las cartas españolas son la
  imagen del producto.

## Evidence on Hand

- Producción en `trucazoweb-production.up.railway.app`, con jugadores de prueba
  reales (`pepe`, `toto`, `juana`, `mica`) y partidas jugadas de verdad.
- Suite de auditoría que juega partidas completas contra el servidor real y
  verifica invariantes de plata (`apps/game-server/src/*.test.ts`).
- No hay testimonios, ni métricas de uso, ni prensa. No inventar ninguno.
- No hay licencia de juego emitida por ninguna autoridad provincial. La
  plataforma no puede afirmar estar regulada.

## Product Principles

1. **La plata no se toca a mano.** Todo movimiento pasa por el ledger, con
   respaldo contable y auditoría que cierra. Un saldo sin asiento es un bug.
2. **El servidor decide.** El cliente manda intenciones y dibuja lo confirmado.
   Nunca recibe cartas ajenas.
3. **Decir la verdad en pantalla.** Si hay comisión, se muestra; si no alcanza,
   se dice cuánto falta; si algo no se puede jugar, no se ofrece.
4. **Primero el que ya está esperando.** Lo que hace que la app sirva es que dos
   personas se encuentren: la mesa abierta va antes que cualquier otra cosa.
5. **Errores en criollo.** El jugador nunca lee el mensaje técnico del motor.

## Accessibility & Inclusion

- Mobile-first, objetivos táctiles cómodos para jugar con una mano.
- Se respeta `prefers-reduced-motion` sin que se pierda información: los sellos
  y avisos tienen que seguir siendo visibles sin animación.
