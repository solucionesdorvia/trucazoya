# Manual del cajero

El cajero es quien **carga** monedas a los jugadores y **paga** los retiros. Es
un rol de confianza: maneja plata real por fuera de la plataforma y sus
operaciones quedan todas auditadas.

## Acceso

Ingresás con tu usuario de cajero y vas a **/cajero**. Sólo ven este panel las
cuentas con rol `CASHIER` (o `ADMIN`).

## Cargar monedas

1. El jugador te escribe por WhatsApp (desde el botón "Cargar" de su billetera).
   El mensaje ya trae su **usuario** y un **código** de 6 caracteres.
2. Cobrás por fuera (transferencia, efectivo, etc.).
3. En tu panel, buscás al jugador por usuario o código, ponés el **monto** y una
   **referencia** (ej. número de transferencia) y confirmás.
4. El jugador ve la carga al instante en su billetera.

> El sistema respeta los **límites del jugador** (juego responsable) y **tu
> límite** por operación y por día. Si el jugador está autoexcluido o pasado de
> su tope, la carga se rechaza.

## Pagar retiros

1. En **Retiros pendientes** ves las solicitudes que te asignaron. El monto ya
   está **bloqueado** en la cuenta del jugador.
2. Pagás por fuera y marcás **Pagado**. Si no corresponde, **Rechazás** y el
   monto vuelve a estar disponible para el jugador.
3. Marcar "pagado" descuenta el monto del ledger del jugador de forma definitiva.

## Reglas de oro (antifraude)

- **Nunca** cargues sin haber cobrado. Toda carga queda registrada a tu nombre.
- Cada fin de turno, tu **contador de fichas cargadas** tiene que coincidir con
  la plata que recaudaste. El admin cruza tu contador contra el ledger: si no
  cuadra, salta la alerta.
- No te acredites a vos mismo (el sistema lo impide).
- Un retiro se paga sólo contra una solicitud real del jugador en el panel.
