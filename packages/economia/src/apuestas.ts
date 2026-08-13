/**
 * Apuestas entre jugadores.
 *
 * Flujo: se reserva el monto de cada uno ANTES de arrancar → se juega → el
 * servidor (única fuente de verdad) informa el ganador → se liquida en UNA
 * transacción: premio al ganador + comisión de plataforma, todo asentado.
 *
 * La liquidación es idempotente por `betId`: aunque el game-server reintente,
 * el premio se acredita una sola vez.
 */

import { prisma } from '@trucazo/db';
import { aplicarMovimiento, cuentaPlataforma, ErrorEconomia } from './ledger.js';
import { puedeApostar } from './juego-responsable.js';

export interface ResultadoApuesta {
  ok: boolean;
  error?: string;
  betId?: string;
  pot?: bigint;
}

/**
 * Reserva la apuesta de todos los participantes. Si a alguno no le alcanza,
 * NO se reserva a nadie (la transacción se revierte entera).
 */
export async function reservarApuesta(input: {
  matchId: string;
  monto: number;
  jugadores: Array<{ userId: string; seat: number }>;
  rakeBps?: number;
}): Promise<ResultadoApuesta> {
  if (!Number.isInteger(input.monto) || input.monto <= 0) {
    return { ok: false, error: 'Monto de apuesta inválido' };
  }
  const monto = BigInt(input.monto);
  const rakeBps = input.rakeBps ?? Number(process.env.PLATFORM_RAKE_BPS ?? 500);

  // Juego responsable: ningún jugador autoexcluido o pasado de su límite de
  // pérdida entra a una apuesta. Si uno no puede, no se reserva a nadie.
  for (const j of input.jugadores) {
    const rg = await puedeApostar(j.userId);
    if (!rg.ok) return { ok: false, error: rg.error };
  }

  try {
    const bet = await prisma.$transaction(async (tx) => {
      const creada = await tx.bet.create({
        data: {
          matchId: input.matchId,
          amount: monto,
          rakeBps,
          pot: monto * BigInt(input.jugadores.length),
          state: 'RESERVED',
          participants: {
            create: input.jugadores.map((j) => ({
              userId: j.userId,
              seat: j.seat,
              confirmed: true,
              reserved: true,
            })),
          },
        },
      });

      // Debita a cada uno. Si uno falla, se cae todo.
      for (const j of input.jugadores) {
        await aplicarMovimiento(tx, {
          userId: j.userId,
          type: 'BET_RESERVED',
          amount: -monto,
          idempotencyKey: `bet:${creada.id}:reserve:${j.userId}`,
          reason: 'Apuesta reservada',
          matchId: input.matchId,
          betId: creada.id,
        });
      }
      return creada;
    });

    return { ok: true, betId: bet.id, pot: bet.pot };
  } catch (e) {
    if (e instanceof ErrorEconomia) {
      return {
        ok: false,
        error: e.codigo === 'SALDO_INSUFICIENTE' ? 'Alguien no tiene saldo suficiente' : e.message,
      };
    }
    console.error('[apuesta] error reservando', e);
    return { ok: false, error: 'No se pudo reservar la apuesta' };
  }
}

/**
 * Liquida la apuesta: reparte el pozo entre los ganadores y cobra la comisión.
 * Idempotente: si ya está liquidada, no hace nada.
 */
export async function liquidarApuesta(input: {
  betId: string;
  ganadoresUserIds: string[];
}): Promise<ResultadoApuesta> {
  const bet = await prisma.bet.findUnique({
    where: { id: input.betId },
    include: { participants: true },
  });
  if (!bet) return { ok: false, error: 'No existe esa apuesta' };
  if (bet.state === 'SETTLED') return { ok: true, betId: bet.id, pot: bet.pot }; // ya liquidada
  if (bet.state !== 'RESERVED') return { ok: false, error: `La apuesta está ${bet.state}` };
  if (input.ganadoresUserIds.length === 0) {
    return { ok: false, error: 'No hay ganadores' };
  }

  const ganadores = BigInt(input.ganadoresUserIds.length);
  const aRepartir = bet.pot - (bet.pot * BigInt(bet.rakeBps)) / 10000n;
  const porGanador = aRepartir / ganadores;
  // Las dos divisiones son enteras, así que puede sobrar. Ese resto NO puede
  // quedar en la nada: en 2v2 con un monto no redondo (4005 c/u) el pozo daba
  // 16020 y se repartían 16019 — una ficha destruida por partida. Se lo suma a
  // la comisión, que es la única cuenta que puede absorberlo sin que los dos
  // compañeros cobren distinto.
  const comision = bet.pot - porGanador * ganadores;
  const idPlataforma = await cuentaPlataforma();

  try {
    await prisma.$transaction(async (tx) => {
      for (const userId of input.ganadoresUserIds) {
        await aplicarMovimiento(tx, {
          userId,
          type: 'BET_WON',
          amount: porGanador,
          idempotencyKey: `bet:${bet.id}:win:${userId}`,
          reason: 'Apuesta ganada',
          matchId: bet.matchId,
          betId: bet.id,
          metadata: { pot: Number(bet.pot), comision: Number(comision) },
        });
      }

      // La comisión va a la cuenta de plataforma por partida doble. Meterla
      // como asiento en el ledger de un jugador rompería su cadena de saldos.
      if (comision > 0n) {
        await aplicarMovimiento(tx, {
          userId: idPlataforma,
          type: 'RAKE',
          amount: comision,
          idempotencyKey: `bet:${bet.id}:rake`,
          reason: 'Comisión de plataforma',
          matchId: bet.matchId,
          betId: bet.id,
          metadata: { rakeBps: bet.rakeBps, pot: Number(bet.pot) },
        });
      }

      await tx.bet.update({
        where: { id: bet.id },
        data: { state: 'SETTLED', settledAt: new Date() },
      });
      for (const p of bet.participants) {
        await tx.betParticipant.update({
          where: { id: p.id },
          data: { won: input.ganadoresUserIds.includes(p.userId) },
        });
      }
    });

    return { ok: true, betId: bet.id, pot: bet.pot };
  } catch (e) {
    console.error('[apuesta] error liquidando', e);
    return { ok: false, error: 'No se pudo liquidar la apuesta' };
  }
}

/** Devuelve lo reservado a todos (partida cancelada o anulada). */
export async function reembolsarApuesta(
  betId: string,
  motivo = 'Partida cancelada',
): Promise<ResultadoApuesta> {
  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    include: { participants: true },
  });
  if (!bet) return { ok: false, error: 'No existe esa apuesta' };
  if (bet.state === 'REFUNDED') return { ok: true, betId: bet.id };
  if (bet.state !== 'RESERVED') return { ok: false, error: `La apuesta está ${bet.state}` };

  try {
    await prisma.$transaction(async (tx) => {
      for (const p of bet.participants) {
        await aplicarMovimiento(tx, {
          userId: p.userId,
          type: 'BET_REFUND',
          amount: bet.amount,
          idempotencyKey: `bet:${bet.id}:refund:${p.userId}`,
          reason: motivo,
          matchId: bet.matchId,
          betId: bet.id,
        });
      }
      await tx.bet.update({ where: { id: bet.id }, data: { state: 'REFUNDED' } });
    });
    return { ok: true, betId: bet.id };
  } catch (e) {
    console.error('[apuesta] error reembolsando', e);
    return { ok: false, error: 'No se pudo reembolsar' };
  }
}
