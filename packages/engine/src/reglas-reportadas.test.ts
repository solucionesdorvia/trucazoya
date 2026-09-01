/**
 * Dos reglas que un jugador reportó jugando de verdad:
 *
 *  1. "Cuando decís envido, y el otro te dice envido otra vez, se puede tocar
 *     envido otra vez, ilimitadas veces, y se van sumando los puntos: en vez
 *     de ser por 4, después x6, después x8 y así."
 *     En el truco sólo existe "envido, envido". El segundo cierra esa escalera:
 *     después sólo se puede subir a real envido o falta envido.
 *
 *  2. "Mazo en primera mano sin jugar ninguna carta no te da 2 puntos, te da 1."
 *     Irse al mazo antes de jugar carta en la primera deja sin jugar el envido,
 *     así que el rival se lleva 2: uno del juego y otro del envido.
 */

import { describe, expect, it } from 'vitest';
import type { Card } from './cards.js';
import { applyAction, legalActions } from './reducer.js';
import { createMatch, startRound } from './state.js';
import type { Action, MatchState, RuleConfig } from './types.js';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

const RULES_1V1: RuleConfig = {
  pointsToWin: 30,
  players: 2,
  florEnabled: false,
  faltaEnvidoToGame: true,
};

function setup(hands: Card[][]): MatchState {
  return startRound(createMatch(RULES_1V1), hands);
}
const apply = (s: MatchState, a: Action): MatchState => applyAction(s, a).state;

/** Los envidos que ese asiento puede cantar ahora. */
function variantesDeEnvido(s: MatchState, seat: number): string[] {
  return legalActions(s)
    .filter((a) => a.type === 'CALL_ENVIDO' && a.seat === seat)
    .map((a) => (a as { variant: string }).variant);
}

const MANOS: Card[][] = [
  [c('oro', 7), c('copa', 6), c('basto', 4)], // seat0
  [c('espada', 7), c('espada', 6), c('oro', 3)], // seat1 (mano)
];

describe('envido: sólo se puede cantar "envido, envido"', () => {
  it('el segundo envido cierra la escalera; el tercero no existe', () => {
    let s = setup(MANOS);
    const mano = s.round!.manoSeat;
    const otro = mano === 0 ? 1 : 0;

    // Primer envido.
    s = apply(s, { type: 'CALL_ENVIDO', seat: mano, variant: 'ENVIDO' });
    const tras1 = variantesDeEnvido(s, otro);

    // Segundo envido: "envido, envido" = 4 puntos. Es legal.
    expect(tras1, 'después del primer envido se puede decir envido otra vez').toContain('ENVIDO');
    s = apply(s, { type: 'CALL_ENVIDO', seat: otro, variant: 'ENVIDO' });
    const tras2 = variantesDeEnvido(s, mano);

    console.log('\n═══ ESCALERA DEL ENVIDO ═══');
    console.log(`  tras 1 envido → ${tras1.join(', ')}`);
    console.log(`  tras 2 envidos → ${tras2.join(', ') || '(ninguno)'}`);
    console.log(`  envidos cantados: ${s.round!.envido.pending.join(' + ')}\n`);

    // ACÁ ESTABA EL BUG: seguía ofreciendo ENVIDO para siempre.
    expect(tras2, 'no existe el tercer envido: "envido, envido" y se terminó').not.toContain(
      'ENVIDO',
    );
    // Pero sí se puede subir la apuesta.
    expect(tras2, 'después de envido envido se puede real envido').toContain('REAL_ENVIDO');
    expect(tras2, 'y también falta envido').toContain('FALTA_ENVIDO');
  });

  it('envido envido vale 4, no se puede inflar más', () => {
    let s = setup(MANOS);
    const mano = s.round!.manoSeat;
    const otro = mano === 0 ? 1 : 0;
    s = apply(s, { type: 'CALL_ENVIDO', seat: mano, variant: 'ENVIDO' });
    s = apply(s, { type: 'CALL_ENVIDO', seat: otro, variant: 'ENVIDO' });

    const envidos = s.round!.envido.pending.filter((v) => v === 'ENVIDO').length;
    expect(envidos, 'nunca puede haber más de dos envidos cantados').toBe(2);
  });
});

describe('irse al mazo en la primera, sin jugar carta', () => {
  it('le da 2 puntos al rival (uno del juego y uno del envido que no se jugó)', () => {
    let s = setup(MANOS);
    const quienSeVa = s.round!.turnSeat;
    const rival = quienSeVa === 0 ? 1 : 0;
    const equipoRival = s.players.find((p) => p.seat === rival)!.team;
    const antes = s.scores[equipoRival];

    // Nadie jugó carta todavía y nadie cantó envido.
    expect(s.round!.tricks[0]!.length, 'no se jugó ninguna carta').toBe(0);
    expect(s.round!.envido.pending.length, 'no se cantó envido').toBe(0);

    s = apply(s, { type: 'GO_TO_MAZO', seat: quienSeVa });
    const gano = s.scores[equipoRival] - antes;

    console.log('\n═══ MAZO EN PRIMERA SIN JUGAR CARTA ═══');
    console.log(`  el rival ganó: ${gano} puntos (tienen que ser 2)\n`);

    expect(gano, 'irse al mazo antes de jugar carta en la primera paga 2').toBe(2);
  });

  it('si ya se jugó una carta, el mazo paga 1 solo', () => {
    let s = setup(MANOS);
    const primero = s.round!.turnSeat;
    const carta = s.round!.hands[primero]![0]!;
    s = apply(s, { type: 'PLAY_CARD', seat: primero, card: carta });

    const quienSeVa = s.round!.turnSeat;
    const rival = quienSeVa === 0 ? 1 : 0;
    const equipoRival = s.players.find((p) => p.seat === rival)!.team;
    const antes = s.scores[equipoRival];

    s = apply(s, { type: 'GO_TO_MAZO', seat: quienSeVa });
    const gano = s.scores[equipoRival] - antes;

    console.log(`  con una carta jugada, el mazo paga: ${gano} (tiene que ser 1)\n`);
    expect(gano, 'con carta jugada ya no hay envido en juego: paga 1').toBe(1);
  });

  it('si el envido ya se jugó, el mazo paga 1 aunque sea la primera', () => {
    let s = setup(MANOS);
    const mano = s.round!.manoSeat;
    const otro = mano === 0 ? 1 : 0;
    s = apply(s, { type: 'CALL_ENVIDO', seat: mano, variant: 'ENVIDO' });
    s = apply(s, { type: 'RESPOND', seat: otro, response: 'NO_QUIERO' });

    const quienSeVa = s.round!.turnSeat;
    const rival = quienSeVa === 0 ? 1 : 0;
    const equipoRival = s.players.find((p) => p.seat === rival)!.team;
    const antes = s.scores[equipoRival];

    s = apply(s, { type: 'GO_TO_MAZO', seat: quienSeVa });
    const gano = s.scores[equipoRival] - antes;

    console.log(`  con el envido ya resuelto, el mazo paga: ${gano} (tiene que ser 1)\n`);
    expect(gano, 'el envido ya se jugó: el mazo paga sólo el punto del juego').toBe(1);
  });
});
