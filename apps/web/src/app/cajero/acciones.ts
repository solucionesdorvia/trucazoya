'use server';

/**
 * Server Actions del panel de cajero. Toda autorización se chequea acá:
 * el rol nunca se confía al cliente.
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@trucazo/db';
import { acreditarPorCajero, resolverRetiro } from '@trucazo/economia';
import { requireUser } from '@/lib/session';

export interface EstadoCajero {
  error?: string;
  ok?: string;
}

async function exigirCajero() {
  const user = await requireUser();
  const perfil = await prisma.cashierProfile.findUnique({ where: { userId: user.id } });
  if (!perfil || !perfil.active) throw new Error('FORBIDDEN');
  if (user.role !== 'CASHIER' && user.role !== 'ADMIN') throw new Error('FORBIDDEN');
  return user;
}

export async function acreditar(_prev: EstadoCajero, formData: FormData): Promise<EstadoCajero> {
  const cajero = await exigirCajero();

  const usuarioBuscado = String(formData.get('usuario') ?? '').trim();
  const monto = Number(formData.get('monto') ?? 0);
  const referencia = String(formData.get('referencia') ?? '').trim() || undefined;
  // Clave de idempotencia del formulario: evita que un doble envío acredite
  // dos veces. La genera el cliente y viaja oculta.
  const idempotencyKey = String(formData.get('idempotencyKey') ?? '') || randomUUID();

  if (!usuarioBuscado) return { error: 'Indicá el usuario' };

  const destino = await prisma.user.findFirst({
    where: { OR: [{ username: usuarioBuscado }, { id: usuarioBuscado }] },
    select: { id: true, username: true },
  });
  if (!destino) return { error: `No encontré al usuario "${usuarioBuscado}"` };

  const r = await acreditarPorCajero({
    cajeroUserId: cajero.id,
    targetUserId: destino.id,
    monto,
    idempotencyKey,
    referencia,
  });
  if (!r.ok) return { error: r.error };

  revalidatePath('/cajero');
  return {
    ok: r.repetido
      ? `Esa carga ya estaba hecha (no se duplicó).`
      : `Acreditadas ${monto} monedas a ${destino.username}. Nuevo saldo: ${r.saldoNuevo}.`,
  };
}

export async function resolver(formData: FormData): Promise<void> {
  const cajero = await exigirCajero();
  const requestId = String(formData.get('requestId') ?? '');
  const accion = String(formData.get('accion') ?? '') as 'PAID' | 'REJECTED';
  if (accion !== 'PAID' && accion !== 'REJECTED') return;

  await resolverRetiro({
    cajeroUserId: cajero.id,
    requestId,
    accion,
    idempotencyKey: `retiro:${requestId}:${accion}`,
  });

  revalidatePath('/cajero');
}
