/**
 * Cálculo de tantos de Envido y de Flor sobre una mano de 3 cartas.
 * Módulo PURO y determinista.
 */

import { type Card, envidoValue } from './cards.js';

/**
 * Tanto de envido de una mano de 3 cartas.
 *
 * - Con dos o más cartas del mismo palo: 20 + suma de los dos valores más
 *   altos de ese palo.
 * - Sin ningún par del mismo palo: el mayor valor individual (figuras = 0).
 */
export function envidoPoints(cards: readonly Card[]): number {
  const bySuit = new Map<string, number[]>();
  for (const card of cards) {
    const list = bySuit.get(card.suit) ?? [];
    list.push(envidoValue(card));
    bySuit.set(card.suit, list);
  }

  let best = 0;
  let hasPair = false;
  for (const values of bySuit.values()) {
    if (values.length >= 2) {
      hasPair = true;
      const sorted = [...values].sort((a, b) => b - a);
      // sorted[0] y sorted[1] existen porque length >= 2.
      const top2 = (sorted[0] as number) + (sorted[1] as number);
      best = Math.max(best, 20 + top2);
    }
  }

  if (hasPair) return best;

  // Sin par: mayor valor individual.
  let maxSingle = 0;
  for (const card of cards) maxSingle = Math.max(maxSingle, envidoValue(card));
  return maxSingle;
}

/** ¿La mano tiene flor (tres cartas del mismo palo)? */
export function hasFlor(cards: readonly Card[]): boolean {
  if (cards.length < 3) return false;
  const first = cards[0];
  if (!first) return false;
  return cards.every((c) => c.suit === first.suit);
}

/**
 * Tanto de flor: 20 + suma de los valores de las tres cartas.
 * Devuelve 0 si la mano no tiene flor.
 */
export function florPoints(cards: readonly Card[]): number {
  if (!hasFlor(cards)) return 0;
  const sum = cards.reduce((acc, c) => acc + envidoValue(c), 0);
  return 20 + sum;
}
