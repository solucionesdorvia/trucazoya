'use server';

/**
 * Carga y descuento de fichas por el dueño de la plataforma, sin pasar por un
 * cajero. Los cajeros siguen con su propio panel para sus clientes.
 *
 * Todo movimiento pasa por el ledger: nunca se edita el saldo a mano. La clave
 * de idempotencia viaja en el formulario para que un doble toque no cargue dos
 * veces, que en una pantalla de plata es el error caro.
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@trucazo/db';
import { registrarMovimiento } from '@trucazo/economia';
import { requireUser } from '@/lib/session';

export interface EstadoCarga {
  error?: string;
  ok?: string;
  /** Saldo con el que quedó, para mostrarlo sin recargar a mano. */
  saldoNuevo?: string;
}

async function exigirAdmin() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw new Error('FORBIDDEN');
  return user;
}

export async function moverFichas(_prev: EstadoCarga, formData: FormData): Promise<EstadoCarga> {
  const admin = await exigirAdmin();

  const usuario = String(formData.get('usuario') ?? '').trim();
  const monto = Math.floor(Number(formData.get('monto') ?? 0));
  const signo = formData.get('signo') === 'descontar' ? -1 : 1;
  const nota = String(formData.get('nota') ?? '').trim();
  const idempotencyKey = String(formData.get('idempotencyKey') ?? '') || randomUUID();

  if (!usuario) return { error: 'Indicá a quién.' };
  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: 'El monto tiene que ser un número mayor a cero.' };
  }

  const destino = await prisma.user.findFirst({
    where: { OR: [{ username: usuario }, { id: usuario }, { email: usuario }] },
    select: { id: true, username: true, wallet: { select: { balance: true } } },
  });
  if (!destino) return { error: `No encontré a "${usuario}".` };

  const saldoActual = destino.wallet?.balance ?? 0n;
  const delta = BigInt(monto) * BigInt(signo);

  if (saldoActual + delta < 0n) {
    return {
      error:
        `No se puede descontar ${monto.toLocaleString('es-AR')}: ` +
        `${destino.username} tiene ${saldoActual.toLocaleString('es-AR')}.`,
    };
  }

  const r = await registrarMovimiento({
    userId: destino.id,
    type: 'ADMIN_ADJUSTMENT',
    amount: delta,
    idempotencyKey,
    reason: nota || (signo > 0 ? 'Carga manual' : 'Descuento manual'),
    actorUserId: admin.id,
  }).catch((e: unknown) => {
    console.error('[admin/fichas] el movimiento falló', e);
    return null;
  });

  if (!r) return { error: 'No se pudo registrar el movimiento. Probá de nuevo.' };

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: signo > 0 ? 'ADMIN_CARGA' : 'ADMIN_DESCUENTO',
      target: destino.id,
      data: { monto, nota, saldoAnterior: Number(saldoActual) },
    },
  });

  const wallet = await prisma.wallet.findUnique({ where: { userId: destino.id } });
  const saldoNuevo = wallet?.balance ?? 0n;

  revalidatePath('/admin/fichas');
  return {
    ok:
      signo > 0
        ? `Le cargaste ${monto.toLocaleString('es-AR')} fichas a ${destino.username}.`
        : `Le descontaste ${monto.toLocaleString('es-AR')} fichas a ${destino.username}.`,
    saldoNuevo: saldoNuevo.toLocaleString('es-AR'),
  };
}
