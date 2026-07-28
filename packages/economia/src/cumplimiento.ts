/**
 * Cumplimiento regulatorio: jurisdicción, límites por defecto y KYC documental.
 *
 * La configuración operativa (provincias bloqueadas, tope de carga por defecto)
 * vive en `SystemSetting`, así el operador con licencia la ajusta sin redeploy.
 */

import { prisma } from '@trucazo/db';

// ─── Jurisdicción ─────────────────────────────────────────────────────────────

interface ConfigJurisdiccion {
  /** Provincias donde NO se permite operar (códigos, ej. ["SF"]). */
  bloqueadas: string[];
}

export async function configJurisdiccion(): Promise<ConfigJurisdiccion> {
  const s = await prisma.systemSetting.findUnique({ where: { key: 'jurisdiction' } });
  const val = (s?.value ?? {}) as Partial<ConfigJurisdiccion>;
  return { bloqueadas: Array.isArray(val.bloqueadas) ? val.bloqueadas : [] };
}

/** ¿Se puede operar desde esta provincia? Bloquea las de la lista del operador. */
export async function provinciaPermitida(province: string): Promise<boolean> {
  const { bloqueadas } = await configJurisdiccion();
  return !bloqueadas.includes(province);
}

// ─── Límites por defecto ──────────────────────────────────────────────────────

interface ConfigRG {
  /** Tope de carga diaria aplicado a quien no fijó el suyo. null = sin tope. */
  defaultDailyDepositMax: number | null;
}

export async function configRG(): Promise<ConfigRG> {
  const s = await prisma.systemSetting.findUnique({ where: { key: 'responsibleGaming' } });
  const val = (s?.value ?? {}) as Partial<ConfigRG>;
  return {
    defaultDailyDepositMax:
      typeof val.defaultDailyDepositMax === 'number' ? val.defaultDailyDepositMax : null,
  };
}

// ─── KYC documental ───────────────────────────────────────────────────────────

export interface EnvioKyc {
  userId: string;
  fullName: string;
  docType: 'DNI' | 'PASSPORT';
  docNumber: string;
  docImageUrl?: string;
}

/** El jugador envía sus datos de identidad. Queda PENDING hasta la revisión. */
export async function enviarKyc(input: EnvioKyc): Promise<{ ok: boolean; error?: string }> {
  if (!input.fullName.trim() || !input.docNumber.trim()) {
    return { ok: false, error: 'Completá nombre y número de documento' };
  }
  // Si ya tiene uno pendiente, no dupliquemos la cola.
  const pendiente = await prisma.kycSubmission.findFirst({
    where: { userId: input.userId, state: 'PENDING' },
  });
  if (pendiente) return { ok: false, error: 'Ya tenés una verificación en revisión' };

  await prisma.kycSubmission.create({
    data: {
      userId: input.userId,
      fullName: input.fullName.trim(),
      docType: input.docType,
      docNumber: input.docNumber.trim(),
      docImageUrl: input.docImageUrl,
    },
  });
  return { ok: true };
}

/** Estado KYC del jugador para la UI. */
export async function estadoKyc(
  userId: string,
): Promise<'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { kycVerifiedAt: true },
  });
  if (u?.kycVerifiedAt) return 'APPROVED';
  const ultimo = await prisma.kycSubmission.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!ultimo) return 'NONE';
  return ultimo.state === 'REJECTED' ? 'REJECTED' : 'PENDING';
}

/** El admin resuelve una verificación KYC. Aprobar marca `kycVerifiedAt`. */
export async function resolverKyc(input: {
  adminUserId: string;
  submissionId: string;
  accion: 'APPROVED' | 'REJECTED';
  nota?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sub = await prisma.kycSubmission.findUnique({ where: { id: input.submissionId } });
  if (!sub) return { ok: false, error: 'No existe esa verificación' };
  if (sub.state !== 'PENDING') return { ok: false, error: `Ya está ${sub.state}` };

  await prisma.$transaction(async (tx) => {
    await tx.kycSubmission.update({
      where: { id: sub.id },
      data: {
        state: input.accion,
        reviewedById: input.adminUserId,
        reviewNote: input.nota,
        reviewedAt: new Date(),
      },
    });
    if (input.accion === 'APPROVED') {
      await tx.user.update({ where: { id: sub.userId }, data: { kycVerifiedAt: new Date() } });
    }
    await tx.auditLog.create({
      data: {
        actorId: input.adminUserId,
        action: `KYC_${input.accion}`,
        target: sub.userId,
        data: { submissionId: sub.id },
      },
    });
    await tx.notification.create({
      data: {
        userId: sub.userId,
        type: input.accion === 'APPROVED' ? 'KYC_APROBADO' : 'KYC_RECHAZADO',
        data: { nota: input.nota ?? null },
      },
    });
  });
  return { ok: true };
}

/** Cola de KYC pendientes para el panel de admin. */
export function kycPendientes() {
  return prisma.kycSubmission.findMany({
    where: { state: 'PENDING' },
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: 'asc' },
  });
}
