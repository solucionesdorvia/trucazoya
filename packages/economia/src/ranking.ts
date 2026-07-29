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

export interface FilaRanking {
  userId: string;
  username: string;
  displayName: string;
  games: number;
  wins: number;
  puntos: number;
}

/**
 * Ranking por PERÍODO: cuenta jugadas y ganadas de partidas TERMINADAS en la
 * ventana [desde, ahora]. Puntos = ganadas × 3 + jugadas (jugar suma, ganar
 * suma más). Todos contra todos: no depende del nivel, así que crearse mil
 * cuentas no sirve — solo suma el que efectivamente juega y gana.
 * `desde = null` → de toda la historia.
 */
export async function rankingPorPeriodo(
  mode: GameMode,
  desde: Date | null,
  limite = 100,
): Promise<FilaRanking[]> {
  const filas = await prisma.matchPlayer.findMany({
    where: {
      isBot: false,
      match: {
        mode,
        state: 'FINISHED',
        ...(desde ? { finishedAt: { gte: desde } } : {}),
      },
    },
    select: {
      userId: true,
      team: true,
      match: { select: { winnerTeam: true } },
      user: { select: { username: true, profile: { select: { displayName: true } } } },
    },
  });

  const acc = new Map<string, FilaRanking>();
  for (const f of filas) {
    const prev =
      acc.get(f.userId) ??
      ({
        userId: f.userId,
        username: f.user.username,
        displayName: f.user.profile?.displayName ?? f.user.username,
        games: 0,
        wins: 0,
        puntos: 0,
      } as FilaRanking);
    prev.games += 1;
    if (f.match.winnerTeam !== null && f.match.winnerTeam === f.team) prev.wins += 1;
    acc.set(f.userId, prev);
  }

  return [...acc.values()]
    .map((r) => ({ ...r, puntos: r.wins * 3 + r.games }))
    .sort((a, b) => b.puntos - a.puntos || b.wins - a.wins)
    .slice(0, limite);
}
