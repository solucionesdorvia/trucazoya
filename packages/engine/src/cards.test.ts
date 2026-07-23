import { describe, expect, it } from 'vitest';
import {
  type Card,
  cardId,
  compareTruco,
  envidoValue,
  fullDeck,
  parseCardId,
  trucoPower,
} from './cards.js';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

describe('baraja', () => {
  it('tiene 40 cartas únicas sin 8 ni 9', () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(40);
    expect(new Set(deck.map(cardId)).size).toBe(40);
    expect(deck.some((x) => x.rank === (8 as never) || x.rank === (9 as never))).toBe(false);
  });

  it('cardId/parseCardId son inversos', () => {
    for (const card of fullDeck()) {
      expect(parseCardId(cardId(card))).toEqual(card);
    }
  });
});

describe('jerarquía del truco', () => {
  it('respeta el orden canónico de las cartas bravas', () => {
    expect(trucoPower(c('espada', 1))).toBe(14);
    expect(trucoPower(c('basto', 1))).toBe(13);
    expect(trucoPower(c('espada', 7))).toBe(12);
    expect(trucoPower(c('oro', 7))).toBe(11);
  });

  it('el 1 de espada le gana a todas', () => {
    const ancho = c('espada', 1);
    for (const other of fullDeck()) {
      if (cardId(other) === cardId(ancho)) continue;
      expect(compareTruco(ancho, other)).toBeGreaterThan(0);
    }
  });

  it('los 3 empardan entre sí y le ganan a los 2', () => {
    expect(compareTruco(c('oro', 3), c('copa', 3))).toBe(0);
    expect(compareTruco(c('oro', 3), c('espada', 2))).toBeGreaterThan(0);
  });

  it('el 7 de oro le gana a los 3 pero pierde con el 7 de espada', () => {
    expect(compareTruco(c('oro', 7), c('espada', 3))).toBeGreaterThan(0);
    expect(compareTruco(c('oro', 7), c('espada', 7))).toBeLessThan(0);
  });

  it('el 7 de basto/copa son cartas bajas (valen menos que el 1 falso)', () => {
    expect(compareTruco(c('basto', 7), c('oro', 1))).toBeLessThan(0);
    expect(trucoPower(c('basto', 7))).toBe(4);
    expect(trucoPower(c('copa', 7))).toBe(4);
  });

  it('el 4 es la carta más baja', () => {
    for (const suit of ['espada', 'basto', 'oro', 'copa'] as const) {
      expect(trucoPower(c(suit, 4))).toBe(1);
    }
  });

  it('todas las cartas del mismo rango no-especial empardan', () => {
    expect(compareTruco(c('oro', 12), c('copa', 12))).toBe(0);
    expect(compareTruco(c('espada', 5), c('basto', 5))).toBe(0);
  });
});

describe('valor de envido', () => {
  it('figuras valen 0 y el resto su número', () => {
    expect(envidoValue(c('oro', 10))).toBe(0);
    expect(envidoValue(c('oro', 11))).toBe(0);
    expect(envidoValue(c('oro', 12))).toBe(0);
    expect(envidoValue(c('oro', 7))).toBe(7);
    expect(envidoValue(c('oro', 1))).toBe(1);
  });
});
