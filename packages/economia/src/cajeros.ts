/**
 * Sistema de cajeros: reemplaza a la pasarela de pagos.
 *
 * Cómo funciona: el jugador arregla con un cajero por WhatsApp (fuera de la
 * plataforma) y el cajero acredita/paga desde su panel. Toda operación queda
 * como asiento del ledger + registro de auditoría, con límites por operación
 * y por día.
 */

import { prisma } from '@trucazo/db';
import { whatsappLink } from '@trucazo/shared';
import { aplicarMovimiento, ErrorEconomia } from './ledger.js';

export interface CajeroPublico {
  userId: string;
  nombre: string;
  whatsapp: string;
  /** Link wa.me con el mensaje ya escrito. */
  linkWhatsapp: string;
  activo: boolean;
}

/** Cajeros disponibles, con el link de WhatsApp prellenado para este usuario. */
export async function listarCajeros(
  usuario: { username: string; id: string },
  intencion: 'CARGAR' | 'RETIRAR' = 'CARGAR',
  monto?: number,
): Promise<CajeroPublico[]> {
  const cajeros = await prisma.cashierProfile.findMany({
    where: { active: true, user: { suspended: false } },
    orderBy: { createdAt: 'asc' },
  });

  return cajeros.map((c) => {
    const accion = intencion === 'CARGAR' ? 'cargar' : 'retirar';
    const cuanto = monto ? ` ${monto}` : '';
    const mensaje =
      `Hola! Soy ${usuario.username} en Trucazo (código ${usuario.id.slice(-6).toUpperCase()}). ` +
      `Quiero ${accion}${cuanto} monedas.`;
    return {
      userId: c.userId,
      nombre: c.displayName,
      whatsapp: c.whatsappE164,
      linkWhatsapp: whatsappLink(c.whatsappE164, mensaje),
      activo: c.active,
    };
  });
}

/** Cuánto acreditó un cajero en las últimas 24 h (para el límite diario). */
async function acreditadoHoy(cajeroUserId: string): Promise<bigint> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const filas = await prisma.ledgerEntry.findMany({
    where: { actorUserId: cajeroUserId, type: 'CASHIER_DEPOSIT', createdAt: { gte: desde } },
    select: { amount: true },
  });
  return filas.reduce((acc, f) => acc + f.amount, 0n);
}

export interface ResultadoCajero {
  ok: boolean;
  error?: string;
  saldoNuevo?: bigint;
  repetido?: boolean;
}

/**
 * El cajero acredita monedas a un jugador (después de cobrarle por fuera).
 * Valida rol, límites y deja auditoría. Idempotente por `idempotencyKey`.
 */
export async function acreditarPorCajero(input: {
  cajeroUserId: string;
  targetUserId: string;
  monto: number;
  idempotencyKey: string;
  referencia?: string;
  nota?: string;
}): Promise<ResultadoCajero> {
  if (!Number.isInteger(input.monto) || input.monto <= 0) {
    return { ok: false, error: 'El monto debe ser un entero positivo' };
  }
  const monto = BigInt(input.monto);

  const cajero = await prisma.cashierProfile.findUnique({
    where: { userId: input.cajeroUserId },
    include: { user: true },
  });
  if (!cajero || !cajero.active) return { ok: false, error: 'No sos un cajero activo' };
  if (cajero.user.suspended) return { ok: false, error: 'Tu cuenta de cajero está suspendida' };

  if (monto > cajero.perOpMax) {
    return { ok: false, error: `El máximo por operación es ${cajero.perOpMax}` };
  }
  const hoy = await acreditadoHoy(input.cajeroUserId);
  if (hoy + monto > cajero.perDayMax) {
    return { ok: false, error: `Superás tu límite diario (${cajero.perDayMax})` };
  }

  const destino = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { id: true, suspended: true },
  });
  if (!destino) return { ok: false, error: 'No existe ese jugador' };
  if (destino.suspended) return { ok: false, error: 'Ese jugador está suspendido' };
  if (destino.id === input.cajeroUserId) {
    return { ok: false, error: 'No podés acreditarte a vos mismo' };
  }

  try {
    const res = await prisma.$transaction(async (tx) => {
      const mov = await aplicarMovimiento(tx, {
        userId: input.targetUserId,
        type: 'CASHIER_DEPOSIT',
        amount: monto,
        idempotencyKey: input.idempotencyKey,
        reason: input.nota ?? 'Carga por cajero',
        actorUserId: input.cajeroUserId,
        metadata: { referencia: input.referencia ?? null },
      });

      if (!mov.repetido) {
        await tx.cashierProfile.update({
          where: { userId: input.cajeroUserId },
          data: { totalDeposited: { increment: monto } },
        });
        await tx.auditLog.create({
          data: {
            actorId: input.cajeroUserId,
            action: 'CASHIER_DEPOSIT',
            target: input.targetUserId,
            data: { monto: input.monto, referencia: input.referencia ?? null },
          },
        });
        await tx.notification.create({
          data: {
            userId: input.targetUserId,
            type: 'CARGA_ACREDITADA',
            data: { monto: input.monto, cajero: cajero.displayName },
          },
        });
      }
      return mov;
    });

    return { ok: true, saldoNuevo: res.balanceAfter, repetido: res.repetido };
  } catch (e) {
    if (e instanceof ErrorEconomia) return { ok: false, error: e.message };
    console.error('[cajero] error acreditando', e);
    return { ok: false, error: 'No se pudo completar la carga' };
  }
}

/**
 * El jugador pide un retiro: el monto se BLOQUEA (sale de disponible) para que
 * no pueda apostarlo mientras el cajero lo procesa.
 */
export async function solicitarRetiro(input: {
  userId: string;
  cajeroUserId: string;
  monto: number;
}): Promise<{ ok: boolean; error?: string; requestId?: string }> {
  if (!Number.isInteger(input.monto) || input.monto <= 0) {
    return { ok: false, error: 'El monto debe ser un entero positivo' };
  }
  const monto = BigInt(input.monto);

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { emailVerified: true, isGuest: true, suspended: true },
  });
  if (!user) return { ok: false, error: 'Usuario inexistente' };
  // Retirar exige cuenta real y verificada: es la barrera contra multicuentas
  // que farmean bonos para sacarlos por caja.
  if (user.isGuest) return { ok: false, error: 'Necesitás una cuenta registrada para retirar' };
  if (!user.emailVerified) return { ok: false, error: 'Verificá tu email antes de retirar' };
  if (user.suspended) return { ok: false, error: 'Tu cuenta está suspendida' };

  const cajero = await prisma.cashierProfile.findUnique({ where: { userId: input.cajeroUserId } });
  if (!cajero?.active) return { ok: false, error: 'Ese cajero no está disponible' };

  try {
    const req = await prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<Array<{ id: string; balance: bigint; locked: bigint }>>`
        SELECT id, balance, locked FROM "Wallet" WHERE "userId" = ${input.userId} FOR UPDATE
      `;
      const w = filas[0];
      if (!w) throw new ErrorEconomia('Sin billetera', 'BILLETERA_INEXISTENTE');
      if (BigInt(w.balance) < monto) {
        throw new ErrorEconomia('No te alcanza el saldo', 'SALDO_INSUFICIENTE');
      }

      // Bloquear: sale de disponible pero todavía NO es un movimiento del
      // ledger (la plata sigue siendo del usuario hasta que el cajero pague).
      await tx.wallet.update({
        where: { id: w.id },
        data: {
          balance: BigInt(w.balance) - monto,
          locked: BigInt(w.locked) + monto,
          version: { increment: 1 },
        },
      });

      return tx.withdrawalRequest.create({
        data: {
          userId: input.userId,
          cashierId: input.cajeroUserId,
          amount: monto,
          state: 'RESERVED',
        },
      });
    });
    return { ok: true, requestId: req.id };
  } catch (e) {
    if (e instanceof ErrorEconomia) return { ok: false, error: e.message };
    console.error('[cajero] error solicitando retiro', e);
    return { ok: false, error: 'No se pudo crear la solicitud' };
  }
}

/**
 * El cajero resuelve un retiro: PAID (ya le pagó por fuera) o REJECTED.
 * - PAID: el monto bloqueado se convierte en un débito real del ledger.
 * - REJECTED: se devuelve a disponible sin tocar el ledger.
 */
export async function resolverRetiro(input: {
  cajeroUserId: string;
  requestId: string;
  accion: 'PAID' | 'REJECTED';
  idempotencyKey: string;
  nota?: string;
}): Promise<ResultadoCajero> {
  const req = await prisma.withdrawalRequest.findUnique({ where: { id: input.requestId } });
  if (!req) return { ok: false, error: 'No existe esa solicitud' };
  if (req.cashierId !== input.cajeroUserId) {
    return { ok: false, error: 'Esa solicitud no es tuya' };
  }
  if (req.state !== 'RESERVED' && req.state !== 'PENDING') {
    return { ok: false, error: `La solicitud ya está ${req.state}` };
  }

  try {
    const res = await prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<Array<{ id: string; balance: bigint; locked: bigint }>>`
        SELECT id, balance, locked FROM "Wallet" WHERE "userId" = ${req.userId} FOR UPDATE
      `;
      const w = filas[0];
      if (!w) throw new ErrorEconomia('Sin billetera', 'BILLETERA_INEXISTENTE');

      if (input.accion === 'REJECTED') {
        // Devolver a disponible.
        await tx.wallet.update({
          where: { id: w.id },
          data: {
            balance: BigInt(w.balance) + req.amount,
            locked: BigInt(w.locked) - req.amount,
            version: { increment: 1 },
          },
        });
        await tx.withdrawalRequest.update({
          where: { id: req.id },
          data: { state: 'REJECTED', note: input.nota, resolvedAt: new Date() },
        });
      } else {
        // Pagado: liberamos el bloqueo y lo asentamos como débito real.
        // Primero devolvemos a `balance` para que el asiento refleje la
        // cadena correcta, y el movimiento lo descuenta.
        await tx.wallet.update({
          where: { id: w.id },
          data: {
            balance: BigInt(w.balance) + req.amount,
            locked: BigInt(w.locked) - req.amount,
            version: { increment: 1 },
          },
        });
        await aplicarMovimiento(tx, {
          userId: req.userId,
          type: 'CASHIER_WITHDRAWAL',
          amount: -req.amount,
          idempotencyKey: input.idempotencyKey,
          reason: input.nota ?? 'Retiro pagado por cajero',
          actorUserId: input.cajeroUserId,
        });
        await tx.cashierProfile.update({
          where: { userId: input.cajeroUserId },
          data: { totalWithdrawn: { increment: req.amount } },
        });
        await tx.withdrawalRequest.update({
          where: { id: req.id },
          data: { state: 'PAID', note: input.nota, resolvedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: input.cajeroUserId,
          action: `WITHDRAWAL_${input.accion}`,
          target: req.userId,
          data: { requestId: req.id, monto: Number(req.amount) },
        },
      });
      await tx.notification.create({
        data: {
          userId: req.userId,
          type: input.accion === 'PAID' ? 'RETIRO_PAGADO' : 'RETIRO_RECHAZADO',
          data: { monto: Number(req.amount) },
        },
      });

      const final = await tx.wallet.findUnique({ where: { id: w.id } });
      return final?.balance ?? 0n;
    });

    return { ok: true, saldoNuevo: res };
  } catch (e) {
    if (e instanceof ErrorEconomia) return { ok: false, error: e.message };
    console.error('[cajero] error resolviendo retiro', e);
    return { ok: false, error: 'No se pudo resolver la solicitud' };
  }
}

/** Cola de solicitudes pendientes de un cajero. */
export function retirosPendientes(cajeroUserId: string) {
  return prisma.withdrawalRequest.findMany({
    where: { cashierId: cajeroUserId, state: { in: ['PENDING', 'RESERVED'] } },
    include: { user: { select: { username: true, profile: { select: { displayName: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
}
