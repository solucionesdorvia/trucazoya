'use server';

/** Server Actions de billetera: pedir retiros y cancelarlos. */

import { revalidatePath } from 'next/cache';
import { prisma } from '@trucazo/db';
import { solicitarRetiro } from '@trucazo/economia';
import { requireUser } from '@/lib/session';

export interface EstadoRetiro {
  error?: string;
  ok?: string;
}

export async function pedirRetiro(
  _prev: EstadoRetiro,
  formData: FormData,
): Promise<EstadoRetiro> {
  const user = await requireUser();
  const monto = Number(formData.get('monto') ?? 0);
  const cajeroUserId = String(formData.get('cajero') ?? '');

  if (!cajeroUserId) return { error: 'Elegí un cajero' };

  const r = await solicitarRetiro({ userId: user.id, cajeroUserId, monto });
  if (!r.ok) return { error: r.error };

  revalidatePath('/billetera');
  return { ok: 'Pedido enviado. Escribile al cajero por WhatsApp para coordinar el pago.' };
}

export async function cancelarRetiro(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');

  const req = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!req || req.userId !== user.id) return;
  if (req.state !== 'RESERVED' && req.state !== 'PENDING') return;

  // Devuelve lo bloqueado a disponible. No toca el ledger: la plata nunca
  // dejó de ser del usuario.
  await prisma.$transaction(async (tx) => {
    const w = await tx.wallet.findUnique({ where: { userId: user.id } });
    if (!w) return;
    await tx.wallet.update({
      where: { id: w.id },
      data: {
        balance: w.balance + req.amount,
        locked: w.locked - req.amount,
        version: { increment: 1 },
      },
    });
    await tx.withdrawalRequest.update({
      where: { id },
      data: { state: 'CANCELLED_BY_USER', resolvedAt: new Date() },
    });
  });

  revalidatePath('/billetera');
}
