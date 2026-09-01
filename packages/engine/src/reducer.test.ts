import { describe, expect, it } from 'vitest';
import type { Card } from './cards.js';
import { applyAction, legalActions } from './reducer.js';
import { redactStateFor } from './redact.js';
import { createMatch, startRound } from './state.js';
import { IllegalActionError, type Action, type MatchState, type RuleConfig } from './types.js';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

const RULES_1V1: RuleConfig = {
  pointsToWin: 30,
  players: 2,
  florEnabled: false,
  faltaEnvidoToGame: true,
};

/** Crea una partida 1v1 con manos fijas. En ronda 0: dealer=0, mano=seat1. */
function setup(hands: Card[][], config: RuleConfig = RULES_1V1): MatchState {
  return startRound(createMatch(config), hands);
}

function apply(state: MatchState, action: Action): MatchState {
  return applyAction(state, action).state;
}

describe('flujo básico de bazas', () => {
  it('mano=seat1; el que gana las dos primeras bazas gana la ronda (1 punto sin truco)', () => {
    // seat1 tiene las tres cartas más fuertes.
    let s = setup([
      [c('oro', 4), c('copa', 4), c('basto', 4)], // seat0
      [c('espada', 1), c('basto', 1), c('espada', 7)], // seat1 (mano)
    ]);
    expect(s.round?.turnSeat).toBe(1);
    s = apply(s, { type: 'PLAY_CARD', seat: 1, card: c('espada', 1) });
    s = apply(s, { type: 'PLAY_CARD', seat: 0, card: c('oro', 4) });
    s = apply(s, { type: 'PLAY_CARD', seat: 1, card: c('basto', 1) });
    s = apply(s, { type: 'PLAY_CARD', seat: 0, card: c('copa', 4) });
    expect(s.scores).toEqual([0, 1]);
    expect(s.phase).toBe('ROUND_FINISHED');
  });
});

describe('envido', () => {
  const hands: Card[][] = [
    [c('oro', 4), c('copa', 4), c('basto', 7)], // seat0: envido 7
    [c('espada', 7), c('espada', 6), c('oro', 5)], // seat1: envido 33
  ];

  it('quiero: gana el mayor tanto, 2 puntos', () => {
    let s = setup(hands);
    s = apply(s, { type: 'CALL_ENVIDO', seat: 1, variant: 'ENVIDO' });
    expect(s.phase).toBe('ENVIDO_PENDING');
    s = apply(s, { type: 'RESPOND', seat: 0, response: 'QUIERO' });
    expect(s.scores).toEqual([0, 2]);
    expect(s.phase).toBe('PLAYING');
  });

  it('no quiero: el que cantó gana 1', () => {
    let s = setup(hands);
    s = apply(s, { type: 'CALL_ENVIDO', seat: 1, variant: 'ENVIDO' });
    s = apply(s, { type: 'RESPOND', seat: 0, response: 'NO_QUIERO' });
    expect(s.scores).toEqual([0, 1]);
  });

  it('envido encadenado (envido+envido): quiero paga 4', () => {
    let s = setup(hands);
    s = apply(s, { type: 'CALL_ENVIDO', seat: 1, variant: 'ENVIDO' });
    s = apply(s, { type: 'CALL_ENVIDO', seat: 0, variant: 'ENVIDO' });
    s = apply(s, { type: 'RESPOND', seat: 1, response: 'QUIERO' });
    expect(s.scores).toEqual([0, 4]);
  });

  it('real envido no querido paga 1', () => {
    let s = setup(hands);
    s = apply(s, { type: 'CALL_ENVIDO', seat: 1, variant: 'REAL_ENVIDO' });
    s = apply(s, { type: 'RESPOND', seat: 0, response: 'NO_QUIERO' });
    expect(s.scores).toEqual([0, 1]);
  });
});

describe('truco', () => {
  const strongSeat1: Card[][] = [
    [c('oro', 4), c('copa', 4), c('basto', 4)],
    [c('espada', 1), c('basto', 1), c('espada', 7)],
  ];

  it('quiero y gana la ronda → 2 puntos', () => {
    let s = setup(strongSeat1);
    s = apply(s, { type: 'CALL_TRUCO', seat: 1 });
    expect(s.phase).toBe('TRUCO_PENDING');
    s = apply(s, { type: 'RESPOND', seat: 0, response: 'QUIERO' });
    expect(s.phase).toBe('PLAYING');
    s = apply(s, { type: 'PLAY_CARD', seat: 1, card: c('espada', 1) });
    s = apply(s, { type: 'PLAY_CARD', seat: 0, card: c('oro', 4) });
    s = apply(s, { type: 'PLAY_CARD', seat: 1, card: c('basto', 1) });
    s = apply(s, { type: 'PLAY_CARD', seat: 0, card: c('copa', 4) });
    expect(s.scores).toEqual([0, 2]);
  });

  it('no quiero → el que cantó gana 1', () => {
    let s = setup(strongSeat1);
    s = apply(s, { type: 'CALL_TRUCO', seat: 1 });
    s = apply(s, { type: 'RESPOND', seat: 0, response: 'NO_QUIERO' });
    expect(s.scores).toEqual([0, 1]);
    expect(s.phase).toBe('ROUND_FINISHED');
  });

  it('retruco querido → 3 puntos', () => {
    let s = setup(strongSeat1);
    s = apply(s, { type: 'CALL_TRUCO', seat: 1 });
    s = apply(s, { type: 'CALL_TRUCO', seat: 0 }); // retruco
    s = apply(s, { type: 'RESPOND', seat: 1, response: 'QUIERO' });
    s = apply(s, { type: 'PLAY_CARD', seat: 1, card: c('espada', 1) });
    s = apply(s, { type: 'PLAY_CARD', seat: 0, card: c('oro', 4) });
    s = apply(s, { type: 'PLAY_CARD', seat: 1, card: c('basto', 1) });
    s = apply(s, { type: 'PLAY_CARD', seat: 0, card: c('copa', 4) });
    expect(s.scores).toEqual([0, 3]);
  });
});

describe('mazo', () => {
  it('irse al mazo entrega la ronda al rival con el valor vigente del truco', () => {
    // Antes de jugar carta en la primera también se deja sin jugar el envido,
    // así que son 2: uno del juego y uno del envido. Este test afirmaba 1, que
    // es justo lo que un jugador reportó como bug (ver reglas-reportadas).
    let s = setup([
      [c('oro', 4), c('copa', 4), c('basto', 4)],
      [c('espada', 1), c('basto', 1), c('espada', 7)],
    ]);
    s = apply(s, { type: 'GO_TO_MAZO', seat: 1 });
    expect(s.scores).toEqual([2, 0]);
    expect(s.phase).toBe('ROUND_FINISHED');
  });

  it('con una carta ya jugada, el mazo paga sólo el punto del juego', () => {
    let s = setup([
      [c('oro', 4), c('copa', 4), c('basto', 4)],
      [c('espada', 1), c('basto', 1), c('espada', 7)],
    ]);
    s = apply(s, { type: 'PLAY_CARD', seat: 1, card: c('espada', 1) });
    s = apply(s, { type: 'GO_TO_MAZO', seat: 0 });
    expect(s.scores).toEqual([0, 1]);
  });
});

describe('validación', () => {
  it('rechaza jugar fuera de turno', () => {
    const s = setup([
      [c('oro', 4), c('copa', 5), c('basto', 6)],
      [c('espada', 1), c('basto', 1), c('espada', 7)],
    ]);
    expect(() => apply(s, { type: 'PLAY_CARD', seat: 0, card: c('oro', 4) })).toThrow(
      IllegalActionError,
    );
  });

  it('rechaza jugar una carta que no está en la mano', () => {
    const s = setup([
      [c('oro', 4), c('copa', 5), c('basto', 6)],
      [c('espada', 1), c('basto', 1), c('espada', 7)],
    ]);
    expect(() => apply(s, { type: 'PLAY_CARD', seat: 1, card: c('oro', 12) })).toThrow();
  });

  it('legalActions no está vacío mientras la partida está en curso', () => {
    const s = setup([
      [c('oro', 4), c('copa', 5), c('basto', 6)],
      [c('espada', 1), c('basto', 1), c('espada', 7)],
    ]);
    expect(legalActions(s).length).toBeGreaterThan(0);
  });
});

describe('redacción (seguridad)', () => {
  it('un jugador ve sólo sus cartas, no las del rival', () => {
    const s = setup([
      [c('oro', 4), c('copa', 5), c('basto', 6)], // seat0
      [c('espada', 1), c('basto', 1), c('espada', 7)], // seat1
    ]);
    const view0 = redactStateFor(s, 0);
    expect(view0.myHand).toHaveLength(3);
    expect(view0.myHand.map((x) => x.suit)).toContain('oro');
    // Sabe cuántas cartas tiene el rival, pero no cuáles.
    expect(view0.handCounts[1]).toBe(3);
    const serialized = JSON.stringify(view0);
    expect(serialized).not.toContain('"rank":7'); // el 7 de espada del rival no aparece
  });
});
