'use server';

/**
 * Acciones de moderación. Sólo ADMIN o MODERATOR. Cada acción queda en el
 * AuditLog: nada de sanciones sin rastro.
 */

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@trucazo/db';
import { registrarMovimiento, resolverKyc } from '@trucazo/economia';
import { requireUser } from '@/lib/session';

async function exigirModerador() {
  const user = await requireUser();
  if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') throw new Error('FORBIDDEN');
  return user;
}

/** Aprueba o rechaza una verificación KYC. Aprobar habilita los retiros. */
export async function resolverKycAccion(formData: FormData): Promise<void> {
  const admin = await exigirModerador();
  const submissionId = String(formData.get('submissionId') ?? '');
  const accion = String(formData.get('accion') ?? '');
  if (accion !== 'APPROVED' && accion !== 'REJECTED') return;

  await resolverKyc({
    adminUserId: admin.id,
    submissionId,
    accion,
    nota: String(formData.get('nota') ?? '').trim() || undefined,
  });
  revalidatePath('/admin');
}

export async function resolverReporte(formData: FormData): Promise<void> {
  const mod = await exigirModerador();
  const id = String(formData.get('id') ?? '');
  const accion = String(formData.get('accion') ?? '');

  const reporte = await prisma.report.findUnique({ where: { id } });
  if (!reporte) return;

  await prisma.$transaction(async (tx) => {
    await tx.report.update({
      where: { id },
      data: {
        state: accion === 'sancionar' ? 'RESOLVED' : 'DISMISSED',
        moderatorId: mod.id,
        resolution: accion,
      },
    });

    if (accion === 'sancionar') {
      await tx.sanction.create({
        data: {
          userId: reporte.reportedId,
          type: 'WARNING',
          reason: `Reporte por ${reporte.reason}`,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: mod.id,
        action: `REPORT_${accion.toUpperCase()}`,
        target: reporte.reportedId,
        data: { reportId: id, reason: reporte.reason },
      },
    });
  });

  revalidatePath('/admin');
}

export async function cambiarSuspension(formData: FormData): Promise<void> {
  const admin = await requireUser();
  if (admin.role !== 'ADMIN') throw new Error('FORBIDDEN');

  const userId = String(formData.get('userId') ?? '');
  const suspender = formData.get('suspender') === 'true';
  if (userId === admin.id) return; // no te suspendas a vos mismo

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { suspended: suspender } }),
    prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: suspender ? 'USER_SUSPEND' : 'USER_UNSUSPEND',
        target: userId,
      },
    }),
  ]);

  revalidatePath('/admin');
}

/** Ajuste manual de saldo (con auditoría y por el ledger). */
export async function ajustarSaldo(formData: FormData): Promise<void> {
  const admin = await requireUser();
  if (admin.role !== 'ADMIN') throw new Error('FORBIDDEN');

  const userId = String(formData.get('userId') ?? '');
  const monto = Number(formData.get('monto') ?? 0);
  const motivo = String(formData.get('motivo') ?? 'Ajuste administrativo');
  if (!userId || !Number.isInteger(monto) || monto === 0) return;

  await registrarMovimiento({
    userId,
    type: 'ADMIN_ADJUSTMENT',
    amount: BigInt(monto),
    idempotencyKey: randomUUID(),
    reason: motivo,
    actorUserId: admin.id,
  }).catch((e) => console.error('[admin] ajuste falló', e));

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: 'ADMIN_ADJUST',
      target: userId,
      data: { monto, motivo },
    },
  });

  revalidatePath('/admin');
}

/** Crea un torneo de eliminación simple en estado de inscripción. */
export async function crearTorneo(formData: FormData): Promise<void> {
  const admin = await requireUser();
  if (admin.role !== 'ADMIN') throw new Error('FORBIDDEN');

  const name = String(formData.get('name') ?? '').trim();
  const entryFee = Number(formData.get('entryFee') ?? 0);
  const maxPlayers = Number(formData.get('maxPlayers') ?? 8);
  const modeRaw = String(formData.get('mode') ?? 'CASUAL_1V1');
  const mode = ['CASUAL_1V1', 'RANKED_1V1', 'CASUAL_2V2', 'RANKED_2V2'].includes(modeRaw)
    ? (modeRaw as 'CASUAL_1V1' | 'RANKED_1V1' | 'CASUAL_2V2' | 'RANKED_2V2')
    : 'CASUAL_1V1';
  if (!name) return;

  await prisma.tournament.create({
    data: {
      name,
      mode,
      state: 'REGISTRATION',
      entryFee: BigInt(Math.max(0, entryFee)),
      maxPlayers: Math.min(64, Math.max(2, maxPlayers)),
    },
  });
  await prisma.auditLog.create({
    data: { actorId: admin.id, action: 'TOURNAMENT_CREATE', data: { name, mode } },
  });
  revalidatePath('/admin');
  revalidatePath('/torneos');
}
