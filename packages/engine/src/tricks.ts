/**
 * Resolución de bazas y de la ronda (quién gana la "mano"), incluyendo todas
 * las reglas de pardas. Módulo PURO.
 */

import { compareTruco, type Card } from './cards.js';
import type { TeamIndex, TrickOutcome } from './types.js';

/** Equipo de un asiento: los asientos alternan equipos (par=0, impar=1). */
export function teamOfSeat(seat: number): TeamIndex {
  return (seat % 2) as TeamIndex;
}

/**
 * Resuelve una baza a partir de las jugadas (en orden). Devuelve el resultado
 * y el asiento ganador (null si parda). En caso de empate al tope entre cartas
 * del mismo equipo, gana ese equipo; entre equipos distintos, es parda.
 */
export function resolveTrick(plays: ReadonlyArray<{ seat: number; card: Card }>): {
  outcome: TrickOutcome;
  winnerSeat: number | null;
} {
  if (plays.length === 0) return { outcome: 'PARDA', winnerSeat: null };

  let best = plays[0] as { seat: number; card: Card };
  let tiedTeams = new Set<TeamIndex>([teamOfSeat(best.seat)]);

  for (let i = 1; i < plays.length; i++) {
    const play = plays[i] as { seat: number; card: Card };
    const cmp = compareTruco(play.card, best.card);
    if (cmp > 0) {
      best = play;
      tiedTeams = new Set<TeamIndex>([teamOfSeat(play.seat)]);
    } else if (cmp === 0) {
      tiedTeams.add(teamOfSeat(play.seat));
    }
  }

  if (tiedTeams.size > 1) {
    // Empate al tope entre equipos distintos ⇒ parda.
    return { outcome: 'PARDA', winnerSeat: null };
  }
  return {
    outcome: teamOfSeat(best.seat) === 0 ? 'TEAM_0' : 'TEAM_1',
    winnerSeat: best.seat,
  };
}

/**
 * Determina el equipo ganador de la ronda dado el historial de bazas.
 * Devuelve null si aún no está decidido.
 *
 * Reglas de pardas:
 * - Ganar 2 bazas ⇒ gana la ronda.
 * - Emparda la primera: gana el primero que gane una baza posterior; si las
 *   tres son parda, gana la mano.
 * - Gana la primera y emparda una posterior ⇒ gana (ganar + empardar = ganar).
 * - 1-1 con tercera parda ⇒ gana quien ganó la primera baza.
 */
export function resolveRound(
  outcomes: readonly TrickOutcome[],
  manoTeam: TeamIndex,
): TeamIndex | null {
  const wins: [number, number] = [0, 0];
  for (const o of outcomes) {
    if (o === 'TEAM_0') wins[0]++;
    else if (o === 'TEAM_1') wins[1]++;
  }
  if (wins[0] >= 2) return 0;
  if (wins[1] >= 2) return 1;

  const n = outcomes.length;
  const first = outcomes[0];

  if (first && first !== 'PARDA') {
    const firstTeam: TeamIndex = first === 'TEAM_0' ? 0 : 1;
    const other: TeamIndex = firstTeam === 0 ? 1 : 0;
    // Ganó la primera; si emparda una posterior antes de perder otra, gana.
    for (let i = 1; i < n; i++) {
      const o = outcomes[i];
      if (o === 'PARDA') return firstTeam;
      const oTeam: TeamIndex = o === 'TEAM_0' ? 0 : 1;
      if (oTeam === other) break; // 1-1, decide la tercera
    }
    // 1-1: si ya hay tercera y es parda, gana quien ganó la primera.
    if (n === 3 && outcomes[2] === 'PARDA') return firstTeam;
    return null;
  }

  if (first === 'PARDA') {
    // Primera parda: gana el primero que gane una baza.
    for (let i = 1; i < n; i++) {
      const o = outcomes[i];
      if (o !== 'PARDA') return o === 'TEAM_0' ? 0 : 1;
    }
    // Todas parda hasta ahora.
    if (n === 3) return manoTeam;
    return null;
  }

  return null;
}
