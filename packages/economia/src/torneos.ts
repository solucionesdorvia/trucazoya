/**
 * Torneos de eliminación simple. Inscripción con entrada (que va al ledger),
 * generación de llaves y avance de rondas. El premio se reparte por el ledger.
 */

import { prisma } from '@trucazo/db';
import { aplicarMovimiento } from './ledger.js';

/** Inscribe a un usuario, cobrando la entrada si corresponde. */
export async function inscribir(
  tournamentId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const torneo = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { _count: { select: { participants: true } } },
  });
  if (!torneo) return { ok: false, error: 'Torneo inexistente' };
  if (torneo.state !== 'REGISTRATION')
    return { ok: false, error: 'La inscripción no está abierta' };
  if (torneo._count.participants >= torneo.maxPlayers) return { ok: false, error: 'Torneo lleno' };

  const yaEsta = await prisma.tournamentParticipant.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  if (yaEsta) return { ok: false, error: 'Ya estás inscripto' };

  try {
    await prisma.$transaction(async (tx) => {
      if (torneo.entryFee > 0n) {
        await aplicarMovimiento(tx, {
          userId,
          type: 'TOURNAMENT_ENTRY',
          amount: -torneo.entryFee,
          idempotencyKey: `tourney:${tournamentId}:entry:${userId}`,
          reason: `Inscripción a ${torneo.name}`,
          tournamentId,
        });
      }
      await tx.tournamentParticipant.create({ data: { tournamentId, userId } });
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'No te alcanza el saldo para la entrada' };
  }
}

/**
 * Genera las llaves de eliminación simple. Baraja a los inscriptos (con RNG
 * inyectable para tests) y arma los cruces de la primera ronda.
 */
export async function generarLlaves(
  tournamentId: string,
  rng: (max: number) => number,
): Promise<{ ok: boolean; error?: string; partidos?: number }> {
  const torneo = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { participants: { where: { checkedIn: true } } },
  });
  if (!torneo) return { ok: false, error: 'Torneo inexistente' };

  const jugadores = [...torneo.participants];
  if (jugadores.length < 2) return { ok: false, error: 'Faltan participantes con check-in' };

  // Fisher-Yates.
  for (let i = jugadores.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [jugadores[i], jugadores[j]] = [jugadores[j]!, jugadores[i]!];
  }

  const partidos: Array<{ round: number; slot: number; a: string | null; b: string | null }> = [];
  for (let i = 0; i < jugadores.length; i += 2) {
    partidos.push({
      round: 1,
      slot: i / 2,
      a: jugadores[i]?.userId ?? null,
      b: jugadores[i + 1]?.userId ?? null, // bye si es impar
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.tournament.update({ where: { id: tournamentId }, data: { state: 'IN_PROGRESS' } });
    for (const p of partidos) {
      await tx.tournamentMatch.create({
        data: {
          tournamentId,
          round: p.round,
          slot: p.slot,
          // Bye: el que no tiene rival avanza directo.
          winnerUserId: p.b === null ? p.a : null,
        },
      });
    }
  });

  return { ok: true, partidos: partidos.length };
}

/** Registra el ganador de un partido y arma la ronda siguiente si corresponde. */
export async function avanzarPartido(
  tournamentMatchId: string,
  winnerUserId: string,
): Promise<{ ok: boolean; campeon?: string }> {
  const partido = await prisma.tournamentMatch.findUnique({ where: { id: tournamentMatchId } });
  if (!partido) return { ok: false };

  await prisma.tournamentMatch.update({
    where: { id: tournamentMatchId },
    data: { winnerUserId },
  });

  // ¿Ya están todos los de esta ronda?
  const ronda = await prisma.tournamentMatch.findMany({
    where: { tournamentId: partido.tournamentId, round: partido.round },
    orderBy: { slot: 'asc' },
  });
  const pendientes = ronda.filter((m) => !m.winnerUserId);
  if (pendientes.length > 0) return { ok: true };

  const ganadores = ronda.map((m) => m.winnerUserId!).filter(Boolean);
  if (ganadores.length === 1) {
    // Campeón.
    await premiarCampeon(partido.tournamentId, ganadores[0]!);
    return { ok: true, campeon: ganadores[0] };
  }

  // Armar la ronda siguiente.
  const siguiente = partido.round + 1;
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < ganadores.length; i += 2) {
      await tx.tournamentMatch.create({
        data: {
          tournamentId: partido.tournamentId,
          round: siguiente,
          slot: i / 2,
          winnerUserId: ganadores[i + 1] === undefined ? ganadores[i] : null,
        },
      });
    }
  });
  return { ok: true };
}

async function premiarCampeon(tournamentId: string, userId: string): Promise<void> {
  const torneo = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { _count: { select: { participants: true } } },
  });
  if (!torneo) return;

  const pozo = torneo.entryFee * BigInt(torneo._count.participants);
  await prisma.$transaction(async (tx) => {
    await tx.tournament.update({ where: { id: tournamentId }, data: { state: 'FINISHED' } });
    await tx.tournamentParticipant.updateMany({
      where: { tournamentId, userId },
      data: { placement: 1 },
    });
    if (pozo > 0n) {
      await aplicarMovimiento(tx, {
        userId,
        type: 'TOURNAMENT_PRIZE',
        amount: pozo,
        idempotencyKey: `tourney:${tournamentId}:prize`,
        reason: `Campeón de ${torneo.name}`,
        tournamentId,
      });
    }
  });
}

/**
 * Cancela un torneo y le devuelve la entrada a cada inscripto.
 *
 * Sin esto, la entrada de un torneo tenía UNA sola salida: ganarlo. Un torneo
 * que no se llenaba, o que se cancelaba a mano, se quedaba con la plata de
 * todos para siempre — el estado CANCELLED existía en el schema y la web lo
 * mostraba, pero nadie devolvía nada.
 *
 * El reembolso y el cambio de estado van en la MISMA transacción: o vuelve la
 * plata de todos y queda cancelado, o no pasa nada. Y la clave de idempotencia
 * por participante hace que cancelar dos veces no pague dos veces.
 */
export async function cancelarTorneo(
  tournamentId: string,
  motivo = 'Torneo cancelado',
): Promise<{ ok: boolean; error?: string; reembolsados?: number }> {
  const torneo = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { participants: { select: { userId: true } } },
  });
  if (!torneo) return { ok: false, error: 'Torneo inexistente' };
  if (torneo.state === 'CANCELLED') return { ok: false, error: 'El torneo ya estaba cancelado' };
  if (torneo.state === 'FINISHED') {
    // Ya se pagó el premio: devolver ahora sería crear fichas de la nada.
    return { ok: false, error: 'No se puede cancelar un torneo terminado' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.tournament.update({ where: { id: tournamentId }, data: { state: 'CANCELLED' } });
    if (torneo.entryFee > 0n) {
      for (const p of torneo.participants) {
        await aplicarMovimiento(tx, {
          userId: p.userId,
          type: 'TOURNAMENT_ENTRY',
          amount: torneo.entryFee,
          idempotencyKey: `tourney:${tournamentId}:refund:${p.userId}`,
          reason: `Devolución: ${motivo}`,
          tournamentId,
        });
      }
    }
  });

  return { ok: true, reembolsados: torneo.entryFee > 0n ? torneo.participants.length : 0 };
}
