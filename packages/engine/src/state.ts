/**
 * Construcción del estado de partida y de cada ronda.
 * El motor NO baraja: recibe las manos ya repartidas (ver shuffle.ts), lo que
 * lo mantiene puro y determinista.
 */

import type { Card } from './cards.js';
import { hasFlor } from './envido.js';
import { teamOfSeat } from './tricks.js';
import {
  type EnvidoState,
  type FlorState,
  type MatchState,
  type PlayerRef,
  type RoundState,
  type RuleConfig,
  type TrucoState,
} from './types.js';

export function createMatch(config: RuleConfig): MatchState {
  const players: PlayerRef[] = Array.from({ length: config.players }, (_, seat) => ({
    seat,
    team: teamOfSeat(seat),
  }));
  return {
    config,
    players,
    scores: [0, 0],
    phase: 'DEALING',
    round: null,
    roundCount: 0,
    winner: null,
    seq: 0,
  };
}

function emptyEnvido(): EnvidoState {
  return { pending: [], accepted: false, resolved: false, stake: 0, lastCallerSeat: null };
}

function emptyTruco(): TrucoState {
  return { level: 0, accepted: false, lastCallerTeam: null };
}

function emptyFlor(seatsWithFlor: number[]): FlorState {
  return {
    seatsWithFlor,
    contested: null,
    resolved: seatsWithFlor.length === 0,
    lastCallerSeat: null,
  };
}

/**
 * Inicia una nueva ronda con las manos repartidas. `hands[i]` son las 3 cartas
 * del asiento `i`. El repartidor (dealer) rota por ronda; la mano es el
 * siguiente al repartidor.
 */
export function startRound(state: MatchState, hands: Card[][]): MatchState {
  const n = state.config.players;
  const dealerSeat = state.roundCount % n;
  const manoSeat = (dealerSeat + 1) % n;

  const dealt: Record<number, Card[]> = {};
  const handsBySeat: Record<number, Card[]> = {};
  const seatsWithFlor: number[] = [];
  for (let seat = 0; seat < n; seat++) {
    const cards = hands[seat] ?? [];
    dealt[seat] = [...cards];
    handsBySeat[seat] = [...cards];
    if (state.config.florEnabled && hasFlor(cards)) seatsWithFlor.push(seat);
  }

  const round: RoundState = {
    index: state.roundCount,
    dealerSeat,
    manoSeat,
    dealt,
    hands: handsBySeat,
    tricks: [[]],
    trickOutcomes: [],
    currentTrick: 0,
    turnSeat: manoSeat,
    leadSeat: manoSeat,
    envido: emptyEnvido(),
    truco: emptyTruco(),
    flor: emptyFlor(seatsWithFlor),
    pendingCall: null,
    mazoSeat: null,
    finished: false,
  };

  return {
    ...state,
    phase: 'PLAYING',
    round,
    roundCount: state.roundCount + 1,
    seq: state.seq + 1,
  };
}

export function cloneMatch(state: MatchState): MatchState {
  return structuredClone(state);
}
