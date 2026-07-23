/**
 * Simulador de partidas: juega partidas completas con bots verificando
 * invariantes del motor. Detecta estados imposibles, bucles infinitos y
 * puntajes inválidos. Es la red de seguridad de la corrección del motor.
 */

import { chooseAction, type BotLevel } from '../bots.js';
import { fullDeck } from '../cards.js';
import { applyAction, legalActions } from '../reducer.js';
import { deal, seededRandomInt, shuffle, type RandomInt } from '../shuffle.js';
import { createMatch, startRound } from '../state.js';
import type { MatchState, RuleConfig } from '../types.js';

export interface SimOptions {
  config: RuleConfig;
  level?: BotLevel;
  seed: number;
  /** Corta si una partida supera este número de acciones (anti-bucle). */
  maxActionsPerMatch?: number;
}

export interface SimResult {
  winnerTeam: 0 | 1;
  scores: [number, number];
  rounds: number;
  actions: number;
}

/** Juega UNA partida completa con bots. Lanza si viola algún invariante. */
export function simulateMatch(opts: SimOptions): SimResult {
  const rand: RandomInt = seededRandomInt(opts.seed);
  const level: BotLevel = opts.level ?? 'intermedio';
  const maxActions = opts.maxActionsPerMatch ?? 2000;

  let state: MatchState = createMatch(opts.config);
  const hands = deal(shuffle(fullDeck(), rand), opts.config.players, 3);
  state = startRound(state, hands);

  let actions = 0;
  while (state.phase !== 'MATCH_FINISHED') {
    if (state.phase === 'ROUND_FINISHED') {
      const nextHands = deal(shuffle(fullDeck(), rand), opts.config.players, 3);
      state = startRound(state, nextHands);
      continue;
    }

    const legal = legalActions(state);
    if (legal.length === 0) {
      throw new Error(`Estado sin acciones legales (fase ${state.phase}) — estado imposible`);
    }
    const seat = pickActingSeat(state);
    const action = chooseAction(level, { state, seat, rand });
    const result = applyAction(state, action);
    state = result.state;

    checkInvariants(state);
    if (++actions > maxActions) {
      throw new Error(`Partida no terminó en ${maxActions} acciones — posible bucle`);
    }
  }

  return {
    winnerTeam: state.winner as 0 | 1,
    scores: [state.scores[0], state.scores[1]],
    rounds: state.roundCount,
    actions,
  };
}

/** Determina un asiento con acción legal (el que debe actuar en la fase). */
function pickActingSeat(state: MatchState): number {
  const legal = legalActions(state);
  const first = legal[0];
  if (first) return first.seat;
  return state.round?.turnSeat ?? 0;
}

function checkInvariants(state: MatchState): void {
  if (state.scores[0] < 0 || state.scores[1] < 0) {
    throw new Error(`Puntaje negativo: ${state.scores}`);
  }
  const round = state.round;
  if (round) {
    for (const [seat, cards] of Object.entries(round.hands)) {
      if (cards.length > 3) throw new Error(`Asiento ${seat} con más de 3 cartas`);
    }
    if (round.currentTrick > 2 && !round.finished && state.phase === 'PLAYING') {
      // Más de 3 bazas sin terminar es imposible.
      if (round.tricks.length > 3) throw new Error('Más de 3 bazas en una ronda');
    }
  }
}

/** Corre `count` partidas y agrega estadísticas. Lanza al primer invariante roto. */
export function runSimulation(
  count: number,
  base: Omit<SimOptions, 'seed'>,
): {
  matches: number;
  team0Wins: number;
  team1Wins: number;
  avgRounds: number;
  avgActions: number;
  maxScore: number;
} {
  let team0 = 0;
  let totalRounds = 0;
  let totalActions = 0;
  let maxScore = 0;
  for (let i = 0; i < count; i++) {
    const res = simulateMatch({ ...base, seed: 0x9e3779b9 ^ (i * 2654435761) });
    if (res.winnerTeam === 0) team0++;
    totalRounds += res.rounds;
    totalActions += res.actions;
    maxScore = Math.max(maxScore, res.scores[0], res.scores[1]);
  }
  return {
    matches: count,
    team0Wins: team0,
    team1Wins: count - team0,
    avgRounds: totalRounds / count,
    avgActions: totalActions / count,
    maxScore,
  };
}
