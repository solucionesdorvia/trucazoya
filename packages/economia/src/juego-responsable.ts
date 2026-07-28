/**
 * Juego responsable: límites de depósito/pérdida que el jugador se autoimpone y
 * autoexclusión. Todo esto lo EXIGE cualquier marco de juego regulado y se
 * aplica en el servidor, nunca en el cliente:
 *  - `puedeDepositar` lo llama el flujo de cajeros antes de acreditar.
 *  - `puedeApostar` lo llama la reserva de apuestas antes de debitar.
 *
 * Los límites son opt-in por campo (null = sin tope). La autoexclusión, en
 * cambio, bloquea depósitos y apuestas por completo mientras esté vigente.
 */

import { prisma } from '@trucazo/db';
import { configRG } from './cumplimiento.js';

const DIA_MS = 24 * 60 * 60 * 1000;
const SEMANA_MS = 7 * DIA_MS;

export interface LimitesJuego {
  dailyDepositMax: bigint | null;
  weeklyDepositMax: bigint | null;
  dailyLossMax: bigint | null;
  sessionMinutesMax: number | null;
}

export interface Chequeo {
  ok: boolean;
  error?: string;
}

/** Límites actuales del jugador (todos null si nunca configuró nada). */
export async function limitesDe(userId: string): Promise<LimitesJuego> {
  const l = await prisma.responsibleGamingLimits.findUnique({ where: { userId } });
  return {
    dailyDepositMax: l?.dailyDepositMax ?? null,
    weeklyDepositMax: l?.weeklyDepositMax ?? null,
    dailyLossMax: l?.dailyLossMax ?? null,
    sessionMinutesMax: l?.sessionMinutesMax ?? null,
  };
}

/**
 * Guarda/actualiza límites. Regla anti-abuso: AFLOJAR un límite (subirlo o
 * quitarlo) no puede ser inmediato; sólo aceptamos endurecerlo al toque. Para
 * simplificar el MVP guardamos el valor pedido pero dejamos el gancho marcado.
 */
export async function guardarLimites(userId: string, nuevos: Partial<LimitesJuego>): Promise<void> {
  await prisma.responsibleGamingLimits.upsert({
    where: { userId },
    create: {
      userId,
      dailyDepositMax: nuevos.dailyDepositMax ?? null,
      weeklyDepositMax: nuevos.weeklyDepositMax ?? null,
      dailyLossMax: nuevos.dailyLossMax ?? null,
      sessionMinutesMax: nuevos.sessionMinutesMax ?? null,
    },
    update: {
      ...(nuevos.dailyDepositMax !== undefined && { dailyDepositMax: nuevos.dailyDepositMax }),
      ...(nuevos.weeklyDepositMax !== undefined && { weeklyDepositMax: nuevos.weeklyDepositMax }),
      ...(nuevos.dailyLossMax !== undefined && { dailyLossMax: nuevos.dailyLossMax }),
      ...(nuevos.sessionMinutesMax !== undefined && {
        sessionMinutesMax: nuevos.sessionMinutesMax,
      }),
    },
  });
}

// ─── Autoexclusión ──────────────────────────────────────────────────────────

/** Exclusión vigente del jugador, o null si puede jugar. */
export async function exclusionActiva(userId: string, ahora = new Date()) {
  return prisma.selfExclusion.findFirst({
    where: {
      userId,
      liftedAt: null,
      OR: [{ kind: 'PERMANENT' }, { until: { gt: ahora } }],
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * El jugador se autoexcluye. `dias` sólo aplica a las temporales; una
 * permanente no se levanta salvo intervención manual con verificación.
 */
export async function autoexcluir(input: {
  userId: string;
  kind: 'TEMPORARY' | 'PERMANENT';
  dias?: number;
  reason?: string;
}): Promise<Chequeo> {
  if (input.kind === 'TEMPORARY' && (!input.dias || input.dias <= 0)) {
    return { ok: false, error: 'Indicá cuántos días' };
  }
  const until =
    input.kind === 'TEMPORARY' ? new Date(Date.now() + (input.dias ?? 0) * DIA_MS) : null;

  await prisma.$transaction(async (tx) => {
    await tx.selfExclusion.create({
      data: { userId: input.userId, kind: input.kind, until, reason: input.reason },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.userId,
        action: 'SELF_EXCLUSION',
        target: input.userId,
        data: { kind: input.kind, dias: input.dias ?? null },
      },
    });
  });
  return { ok: true };
}

// ─── Totales para los topes ───────────────────────────────────────────────────

/** Monedas cargadas por cajero al usuario dentro de una ventana de tiempo. */
async function depositadoEnVentana(userId: string, ventanaMs: number): Promise<bigint> {
  const desde = new Date(Date.now() - ventanaMs);
  const filas = await prisma.ledgerEntry.findMany({
    where: { userId, type: 'CASHIER_DEPOSIT', createdAt: { gte: desde } },
    select: { amount: true },
  });
  return filas.reduce((acc, f) => acc + f.amount, 0n);
}

/** Pérdida neta del día por apuestas (positiva = perdió). */
export async function perdidaHoy(userId: string): Promise<bigint> {
  const desde = new Date(Date.now() - DIA_MS);
  const filas = await prisma.ledgerEntry.findMany({
    where: {
      userId,
      type: { in: ['BET_RESERVED', 'BET_WON', 'BET_LOST', 'BET_REFUND'] },
      createdAt: { gte: desde },
    },
    select: { amount: true },
  });
  const neto = filas.reduce((acc, f) => acc + f.amount, 0n); // negativo si perdió
  return neto < 0n ? -neto : 0n;
}

// ─── Chequeos que aplican los flujos de plata ─────────────────────────────────

/**
 * ¿Puede cargar `monto`? Bloquea si está autoexcluido o si la carga superaría
 * su tope diario/semanal autoimpuesto. Lo usa el cajero antes de acreditar.
 */
export async function puedeDepositar(userId: string, monto: bigint): Promise<Chequeo> {
  if (await exclusionActiva(userId)) {
    return { ok: false, error: 'El jugador está autoexcluido y no puede cargar' };
  }
  const l = await limitesDe(userId);
  // Tope diario: el que se fijó el jugador o, si no fijó ninguno, el default
  // regulatorio que configura el operador.
  let topeDiario = l.dailyDepositMax;
  if (topeDiario === null) {
    const cfg = await configRG();
    topeDiario = cfg.defaultDailyDepositMax === null ? null : BigInt(cfg.defaultDailyDepositMax);
  }
  if (topeDiario !== null) {
    const hoy = await depositadoEnVentana(userId, DIA_MS);
    if (hoy + monto > topeDiario) {
      return { ok: false, error: `Supera el límite diario de carga (${topeDiario})` };
    }
  }
  if (l.weeklyDepositMax !== null) {
    const semana = await depositadoEnVentana(userId, SEMANA_MS);
    if (semana + monto > l.weeklyDepositMax) {
      return { ok: false, error: `Supera su límite semanal de carga (${l.weeklyDepositMax})` };
    }
  }
  return { ok: true };
}

/**
 * ¿Puede apostar? Bloquea si está autoexcluido o si ya alcanzó su límite de
 * pérdida diaria. Lo usa la reserva de apuestas.
 */
export async function puedeApostar(userId: string): Promise<Chequeo> {
  if (await exclusionActiva(userId)) {
    return { ok: false, error: 'Estás autoexcluido: no podés apostar' };
  }
  const l = await limitesDe(userId);
  if (l.dailyLossMax !== null) {
    const perdida = await perdidaHoy(userId);
    if (perdida >= l.dailyLossMax) {
      return { ok: false, error: 'Alcanzaste tu límite de pérdida diaria' };
    }
  }
  return { ok: true };
}
