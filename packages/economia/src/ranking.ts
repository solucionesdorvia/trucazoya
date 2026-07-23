/**
 * Aplicación del ranking al terminar una partida. Persiste la nueva
 * clasificación y deja historial para poder graficar la evolución.
 */

import { prisma, type GameMode } from '@trucazo/db';
import {
  actualizarClasificacion,
  CLASIFICACION_INICIAL,
  divisionPara,
  type Oponente,
} from './glicko.js';

export interface JugadorPartida {
  userId: string;
  equipo: number;
}

/**
 * Recalcula el ranking de todos los humanos de una partida.
 * Idempotente por partida: si ya se aplicó, no vuelve a hacerlo.
 */
export async function aplicarRanking(input: {
  matchId: string;
  mode: GameMode;
  jugadores: JugadorPartida[];
  equipoGanador: number;
}): Promise<{ aplicado: boolean }> {
  // Las casuales no mueven el ranking.
  if (!input.mode.startsWith('RANKED')) return { aplicado: false };
  if (input.jugadores.length < 2) return { aplicado: false };

  const yaAplicado = await prisma.ratingHistory.findFirst({
    where: { matchId: input.matchId },
    select: { id: true },
  });
  if (yaAplicado) return { aplicado: false };

  const actuales = await Promise.all(
    input.jugadores.map(async (j) => {
      const r = await prisma.rating.findUnique({
        where: { userId_mode: { userId: j.userId, mode: input.mode } },
      });
      return {
        ...j,
        ratingId: r?.id ?? null,
        clasificacion: r
          ? { rating: r.rating, deviation: r.deviation, volatility: r.volatility }
          : { ...CLASIFICACION_INICIAL },
      };
    }),
  );

  await prisma.$transaction(async (tx) => {
    for (const jugador of actuales) {
      // Los oponentes son los del equipo contrario.
      const rivales: Oponente[] = actuales
        .filter((o) => o.equipo !== jugador.equipo)
        .map((o) => ({
          rating: o.clasificacion.rating,
          deviation: o.clasificacion.deviation,
          resultado: jugador.equipo === input.equipoGanador ? 1 : 0,
        }));

      const nueva = actualizarClasificacion(jugador.clasificacion, rivales);
      const gano = jugador.equipo === input.equipoGanador;

      const fila = await tx.rating.upsert({
        where: { userId_mode: { userId: jugador.userId, mode: input.mode } },
        update: {
          rating: nueva.rating,
          deviation: nueva.deviation,
          volatility: nueva.volatility,
          division: divisionPara(nueva.rating),
          games: { increment: 1 },
          wins: { increment: gano ? 1 : 0 },
          losses: { increment: gano ? 0 : 1 },
        },
        create: {
          userId: jugador.userId,
          mode: input.mode,
          rating: nueva.rating,
          deviation: nueva.deviation,
          volatility: nueva.volatility,
          division: divisionPara(nueva.rating),
          games: 1,
          wins: gano ? 1 : 0,
          losses: gano ? 0 : 1,
        },
      });

      await tx.ratingHistory.create({
        data: {
          ratingId: fila.id,
          matchId: input.matchId,
          before: jugador.clasificacion.rating,
          after: nueva.rating,
        },
      });
    }
  });

  return { aplicado: true };
}

/** Tabla de posiciones de un modo. Excluye clasificaciones provisorias. */
export function tablaPosiciones(mode: GameMode, limite = 50) {
  return prisma.rating.findMany({
    where: { mode, games: { gte: 5 } },
    orderBy: { rating: 'desc' },
    take: limite,
    include: {
      user: {
        select: { username: true, profile: { select: { displayName: true, country: true } } },
      },
    },
  });
}
