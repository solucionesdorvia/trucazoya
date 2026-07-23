/**
 * Bots. Un bot es una política `(view, legalActions) -> Action`. Usa la MISMA
 * interfaz que un jugador humano: sólo ve la proyección redactada y elige
 * entre acciones legales. No accede a cartas ocultas.
 */

import { compareTruco } from './cards.js';
import { envidoPoints } from './envido.js';
import type { RandomInt } from './shuffle.js';
import type { Action, MatchState } from './types.js';
import { legalActions } from './reducer.js';

export type BotLevel = 'principiante' | 'facil' | 'intermedio' | 'dificil' | 'experto';

export interface BotContext {
  state: MatchState;
  seat: number;
  rand: RandomInt;
}

/** Fuerza estimada de la mano (0..1) según poder de truco de las cartas propias. */
function handStrength(ctx: BotContext): number {
  const round = ctx.state.round;
  if (!round) return 0;
  const hand = round.hands[ctx.seat] ?? [];
  if (hand.length === 0) return 0;
  const avg =
    hand.reduce((acc, c) => acc + compareTruco(c, { suit: 'oro', rank: 4 }) + 1, 0) / hand.length;
  return Math.min(1, avg / 14);
}

function pick<T>(arr: T[], rand: RandomInt): T {
  return arr[rand(arr.length)] as T;
}

/**
 * Elige una acción. Los niveles bajos juegan casi al azar; los altos usan
 * heurísticas de fuerza de mano y de envido, con faroleo (bluff) controlado.
 */
export function chooseAction(level: BotLevel, ctx: BotContext): Action {
  const actions = legalActions(ctx.state);
  if (actions.length === 0) throw new Error('No hay acciones legales');

  if (level === 'principiante') return pick(actions, ctx.rand);

  const round = ctx.state.round;
  const strength = handStrength(ctx);
  const myEnvido = round ? envidoPoints(round.dealt[ctx.seat] ?? []) : 0;

  // Responder cantos.
  const quiero = actions.find((a) => a.type === 'RESPOND' && a.response === 'QUIERO');
  const noQuiero = actions.find((a) => a.type === 'RESPOND' && a.response === 'NO_QUIERO');
  if (quiero && noQuiero) {
    if (ctx.state.phase === 'ENVIDO_PENDING') {
      const threshold = level === 'experto' ? 27 : level === 'dificil' ? 26 : 24;
      return myEnvido >= threshold ? quiero : noQuiero;
    }
    if (ctx.state.phase === 'TRUCO_PENDING' || ctx.state.phase === 'FLOR_PENDING') {
      const threshold = level === 'experto' ? 0.55 : level === 'dificil' ? 0.5 : 0.4;
      return strength >= threshold ? quiero : noQuiero;
    }
  }

  // Cantar envido con buen tanto (sólo niveles medios/altos).
  const callEnvido = actions.find((a) => a.type === 'CALL_ENVIDO');
  if (callEnvido && myEnvido >= (level === 'experto' ? 28 : 29) && ctx.rand(100) < 70) {
    return callEnvido;
  }

  // Cantar flor si la tengo.
  const callFlor = actions.find((a) => a.type === 'CALL_FLOR' && a.type === 'CALL_FLOR');
  if (callFlor && callFlor.type === 'CALL_FLOR' && callFlor.variant === 'FLOR') return callFlor;

  // Cantar truco con mano fuerte + bluff ocasional.
  const callTruco = actions.find((a) => a.type === 'CALL_TRUCO');
  if (callTruco) {
    const bluff = level === 'experto' ? 12 : level === 'dificil' ? 8 : 4;
    if (strength >= 0.6 || ctx.rand(100) < bluff) return callTruco;
  }

  // Jugar la carta más baja que gane la baza, o la más baja si no puedo ganar.
  const plays = actions.filter((a) => a.type === 'PLAY_CARD');
  if (plays.length > 0) {
    if (level === 'facil') return pick(plays, ctx.rand);
    const sorted = [...plays].sort((a, b) =>
      a.type === 'PLAY_CARD' && b.type === 'PLAY_CARD' ? compareTruco(a.card, b.card) : 0,
    );
    // Nivel intermedio+: tira la más baja para conservar cartas fuertes.
    return sorted[0] as Action;
  }

  return pick(actions, ctx.rand);
}
