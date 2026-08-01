/**
 * Proyección del estado para un jugador concreto. NUNCA incluye las cartas en
 * mano de otros asientos (sólo las ya jugadas, que son públicas). Esto es lo
 * único que el game-server envía al cliente.
 */

import type { Card } from './cards.js';
import { envidoPoints } from './envido.js';
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
  /** Declaración pública del envido resuelto con quiero: tantos por asiento
   *  en orden de mano (info pública, como cantarlos en la mesa). */
  envidoResult: {
    winnerTeam: TeamIndex;
    stake: number;
    declarations: { seat: number; points: number }[];
  } | null;
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
    envidoResult: null,
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
    envidoResult:
      round.envido.resolved && round.envido.accepted
        ? (() => {
            const decl: { seat: number; points: number }[] = [];
            for (let i = 0; i < state.config.players; i++) {
              const s2 = (round.manoSeat + i) % state.config.players;
              decl.push({ seat: s2, points: envidoPoints(round.dealt[s2] ?? []) });
            }
            const mejorDe = (t: number) =>
              Math.max(...decl.filter((d) => teamOfSeat(d.seat) === t).map((d) => d.points));
            const t0 = mejorDe(0);
            const t1 = mejorDe(1);
            const winnerTeam: TeamIndex =
              t0 > t1
                ? 0
                : t1 > t0
                  ? 1
                  : teamOfSeat(decl.find((d) => d.points === Math.max(t0, t1))!.seat);
            return { winnerTeam, stake: round.envido.stake, declarations: decl };
          })()
        : null,
  };
}
