/**
 * Progresión: XP, nivel, misiones diarias y logros. Otorga recompensas al
 * terminar partidas. Las recompensas en monedas pasan por el ledger.
 */

import { prisma } from '@trucazo/db';
import { registrarMovimiento } from './ledger.js';

/** XP necesaria para pasar del nivel n al n+1. Curva suave. */
export function xpParaNivel(nivel: number): number {
  return 100 + (nivel - 1) * 50;
}

/** Recalcula nivel a partir de XP total acumulada. */
export function nivelPorXp(xpTotal: number): {
  nivel: number;
  xpEnNivel: number;
  xpNecesaria: number;
} {
  let nivel = 1;
  let restante = xpTotal;
  while (restante >= xpParaNivel(nivel)) {
    restante -= xpParaNivel(nivel);
    nivel++;
  }
  return { nivel, xpEnNivel: restante, xpNecesaria: xpParaNivel(nivel) };
}

/** Clave de período diario para las misiones (una por día). */
function claveHoy(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export interface RecompensaPartida {
  xpGanada: number;
  subioNivel: boolean;
  nivelNuevo: number;
  monedasBonus: number;
  logrosDesbloqueados: string[];
}

/**
 * Otorga XP, avanza misiones diarias y chequea logros tras una partida.
 * `fecha` se inyecta para tests deterministas.
 */
export async function otorgarRecompensas(input: {
  userId: string;
  gano: boolean;
  fecha: Date;
}): Promise<RecompensaPartida> {
  const xpGanada = input.gano ? 25 : 10;
  const logrosDesbloqueados: string[] = [];
  let monedasBonus = 0;

  const profile = await prisma.profile.findUnique({ where: { userId: input.userId } });
  const xpAntes = profile?.xp ?? 0;
  const nivelAntes = nivelPorXp(xpAntes).nivel;
  const xpDespues = xpAntes + xpGanada;
  const nivelDespues = nivelPorXp(xpDespues).nivel;
  const subioNivel = nivelDespues > nivelAntes;

  await prisma.profile.update({
    where: { userId: input.userId },
    data: { xp: xpDespues, level: nivelDespues },
  });

  // Subir de nivel da monedas.
  if (subioNivel) {
    monedasBonus = nivelDespues * 20;
    await registrarMovimiento({
      userId: input.userId,
      type: 'LEVEL_REWARD',
      amount: BigInt(monedasBonus),
      idempotencyKey: `level:${input.userId}:${nivelDespues}`,
      reason: `Subiste al nivel ${nivelDespues}`,
    }).catch(() => undefined); // idempotente: si ya cobró ese nivel, no pasa nada
  }

  // Misión diaria: "jugá 3 partidas".
  const periodKey = claveHoy(input.fecha);
  const mision = await prisma.mission.findFirst({ where: { code: 'daily_play_3' } });
  if (mision) {
    const um = await prisma.userMission.upsert({
      where: {
        userId_missionId_periodKey: { userId: input.userId, missionId: mision.id, periodKey },
      },
      update: { progress: { increment: 1 } },
      create: { userId: input.userId, missionId: mision.id, periodKey, progress: 1 },
    });
    if (um.progress >= mision.target && !um.completed) {
      await prisma.userMission.update({ where: { id: um.id }, data: { completed: true } });
      if (mision.rewardCoins > 0) {
        monedasBonus += mision.rewardCoins;
        await registrarMovimiento({
          userId: input.userId,
          type: 'DAILY_BONUS',
          amount: BigInt(mision.rewardCoins),
          idempotencyKey: `mission:${mision.id}:${input.userId}:${periodKey}`,
          reason: 'Misión diaria completada',
        }).catch(() => undefined);
      }
    }
  }

  // Logro: primera victoria.
  if (input.gano) {
    logrosDesbloqueados.push(...(await desbloquear(input.userId, 'first_win')));
  }

  return {
    xpGanada,
    subioNivel,
    nivelNuevo: nivelDespues,
    monedasBonus,
    logrosDesbloqueados,
  };
}

/** Desbloquea un logro si el usuario no lo tenía. Devuelve el código si es nuevo. */
async function desbloquear(userId: string, code: string): Promise<string[]> {
  const logro = await prisma.achievement.findUnique({ where: { code } });
  if (!logro) return [];
  const existe = await prisma.userAchievement.findUnique({
    where: { userId_achievementId: { userId, achievementId: logro.id } },
  });
  if (existe) return [];
  await prisma.userAchievement.create({ data: { userId, achievementId: logro.id } });
  return [logro.name];
}
