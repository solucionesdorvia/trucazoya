/**
 * Proyección del estado para un jugador concreto. NUNCA incluye las cartas en
 * mano de otros asientos (sólo las ya jugadas, que son públicas). Esto es lo
 * único que el game-server envía al cliente.
 */

import type { Card } from './cards.js';
import { teamOfSeat } from './tricks.js';
import type { MatchState, Phase, TeamIndex, TrickOutcome } from './types.js';

export interface PlayerView {
  phase: Phase;
  scores: [number, number];
  pointsToWin: number;
  players: 2 | 4;
  winner: TeamIndex | null;
  seat: number;
  team: TeamIndex;
  /** Cartas propias aún en mano. */
  myHand: Card[];
  /** Cantidad de cartas en mano de cada asiento (públicas). */
  handCounts: Record<number, number>;
  /** Bazas jugadas (cartas públicas). */
  tricks: Array<Array<{ seat: number; card: Card }>>;
  trickOutcomes: TrickOutcome[];
  currentTrick: number;
  turnSeat: number | null;
  manoSeat: number | null;
  dealerSeat: number | null;
  envido: { pending: string[]; resolved: boolean; accepted: boolean };
  truco: { level: number; accepted: boolean };
  flor: { active: boolean; resolved: boolean; iHaveFlor: boolean };
}

export function redactStateFor(state: MatchState, seat: number): PlayerView {
  const round = state.round;
  const base: PlayerView = {
    phase: state.phase,
    scores: [state.scores[0], state.scores[1]],
    pointsToWin: state.config.pointsToWin,
    players: state.config.players,
    winner: state.winner,
    seat,
    team: teamOfSeat(seat),
    myHand: [],
    handCounts: {},
    tricks: [],
    trickOutcomes: [],
    currentTrick: 0,
    turnSeat: null,
    manoSeat: null,
    dealerSeat: null,
    envido: { pending: [], resolved: false, accepted: false },
    truco: { level: 0, accepted: false },
    flor: { active: false, resolved: true, iHaveFlor: false },
  };
  if (!round) return base;

  return {
    ...base,
    myHand: [...(round.hands[seat] ?? [])],
    handCounts: Object.fromEntries(
      Object.entries(round.hands).map(([s, cards]) => [s, cards.length]),
    ),
    tricks: round.tricks.map((t) => t.map((p) => ({ seat: p.seat, card: p.card }))),
    trickOutcomes: [...round.trickOutcomes],
    currentTrick: round.currentTrick,
    turnSeat: round.turnSeat,
    manoSeat: round.manoSeat,
    dealerSeat: round.dealerSeat,
    envido: {
      pending: [...round.envido.pending],
      resolved: round.envido.resolved,
      accepted: round.envido.accepted,
    },
    truco: { level: round.truco.level, accepted: round.truco.accepted },
    flor: {
      active: round.flor.seatsWithFlor.length > 0,
      resolved: round.flor.resolved,
      iHaveFlor: round.flor.seatsWithFlor.includes(seat),
    },
  };
}
